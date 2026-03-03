import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { API_BASE } from '../services/config';

const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutes
const SESSION_TOKEN_KEY = 'opsiq-session-token';

interface AuthContextType {
  isAuthenticated: boolean;
  executiveName: string;
  userRole: string;
  login: (name: string, role: string, sessionToken: string) => void;
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
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [isValidating, setIsValidating] = useState(true);

  // Validate session from Railway on mount
  useEffect(() => {
    const validateStoredSession = async () => {
      const storedToken = localStorage.getItem(SESSION_TOKEN_KEY);
      if (storedToken) {
        try {
          const response = await fetch(`${API_BASE}/api/auth/session`, {
            headers: { 'Authorization': `Bearer ${storedToken}` }
          });
          
          if (response.ok) {
            const data = await response.json();
            setIsAuthenticated(true);
            setExecutiveName(data.name);
            setUserRole(data.role);
            setSessionToken(storedToken);
            resetInactivityTimer();
          } else {
            // Invalid session, clear it
            localStorage.removeItem(SESSION_TOKEN_KEY);
          }
        } catch (error) {
          console.error('Session validation error:', error);
          localStorage.removeItem(SESSION_TOKEN_KEY);
        }
      }
      setIsValidating(false);
    };

    validateStoredSession();
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

  const login = (name: string, role: string, sessionToken: string) => {
    setIsAuthenticated(true);
    setExecutiveName(name);
    setUserRole(role);
    setSessionToken(sessionToken);
    
    // Store session token as pointer to Railway session
    localStorage.setItem(SESSION_TOKEN_KEY, sessionToken);
    
    resetInactivityTimer();
  };

  const logout = async () => {
    const token = sessionToken || localStorage.getItem(SESSION_TOKEN_KEY);
    
    // Delete session from Railway database
    if (token) {
      try {
        await fetch(`${API_BASE}/api/auth/logout`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      } catch (error) {
        console.error('Logout error:', error);
      }
    }
    
    setIsAuthenticated(false);
    setExecutiveName('');
    setUserRole('');
    setSessionToken(null);
    localStorage.removeItem(SESSION_TOKEN_KEY);
    
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
      {isValidating ? <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Loading...</div> : children}
    </AuthContext.Provider>
  );
};
