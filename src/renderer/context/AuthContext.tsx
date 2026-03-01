import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';

const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutes

interface AuthContextType {
  isAuthenticated: boolean;
  executiveName: string;
  login: (name: string) => void;
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
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);

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

  const login = (name: string) => {
    setIsAuthenticated(true);
    setExecutiveName(name);
    resetInactivityTimer();
  };

  const logout = () => {
    setIsAuthenticated(false);
    setExecutiveName('');
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
    <AuthContext.Provider value={{ isAuthenticated, executiveName, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
