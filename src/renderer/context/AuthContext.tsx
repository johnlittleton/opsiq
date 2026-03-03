import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';

const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutes
const AUTH_STORAGE_KEY = 'opsiq-auth';
const AUTH_VERSION_KEY = 'opsiq-auth-version';
const CURRENT_AUTH_VERSION = '2'; // Increment this to force re-login for all users

interface AuthContextType {
  isAuthenticated: boolean;
  executiveName: string;
  userRole: string;
  login: (name: string, role: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [executiveName, setExecutiveName] = useState('');
  const [userRole, setUserRole] = useState('');
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Restore auth from localStorage on mount
  useEffect(() => {
    // Check auth version - if mismatch, force re-login
    const storedVersion = localStorage.getItem(AUTH_VERSION_KEY);
    if (storedVersion !== CURRENT_AUTH_VERSION) {
      console.log('🔄 Auth version mismatch, clearing old session...');
      localStorage.removeItem(AUTH_STORAGE_KEY);
      localStorage.setItem(AUTH_VERSION_KEY, CURRENT_AUTH_VERSION);
      return;
    }

    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    if (stored) {
      try {
        const { name, role, timestamp } = JSON.parse(stored);
        // Validate that we have all required fields (old sessions may be missing role)
        if (!name || !role) {
          console.log('⚠️ Invalid stored session, clearing...');
          localStorage.removeItem(AUTH_STORAGE_KEY);
          return;
        }
        // Auto-restore if session hasn't expired (24 hours)
        if (Date.now() - timestamp < 24 * 60 * 60 * 1000) {
          setIsAuthenticated(true);
          setExecutiveName(name);
          setUserRole(role);
          resetInactivityTimer();
        } else {
          // Expired session, clear it
          localStorage.removeItem(AUTH_STORAGE_KEY);
        }
      } catch (e) {
        localStorage.removeItem(AUTH_STORAGE_KEY);
      }
    }
  }, []);

  const resetInactivityTimer = () => {
    // Clear existing timer
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }

    // Set new timer for 15 minutes
    inactivityTimerRef.current = setTimeout(() => {
      logout();
    }, INACTIVITY_TIMEOUT);
  };

  const login = (name: string, role: string) => {
    setIsAuthenticated(true);
    setExecutiveName(name);
    setUserRole(role);
    
    // Store in localStorage
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
      name,
      role,
      timestamp: Date.now()
    }));
    
    resetInactivityTimer();
  };

  const logout = () => {
    setIsAuthenticated(false);
    setExecutiveName('');
    setUserRole('');
    localStorage.removeItem(AUTH_STORAGE_KEY);
    
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
  };

  // Track user activity globally to reset inactivity timer
  useEffect(() => {
    if (!isAuthenticated) return;

    const handleActivity = () => {
      resetInactivityTimer();
    };

    // Listen for user activity across the entire app
    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keypress', handleActivity);
    window.addEventListener('click', handleActivity);
    window.addEventListener('scroll', handleActivity);

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keypress', handleActivity);
      window.removeEventListener('click', handleActivity);
      window.removeEventListener('scroll', handleActivity);
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, [isAuthenticated]);

  return (
    <AuthContext.Provider value={{ isAuthenticated, executiveName, userRole, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
