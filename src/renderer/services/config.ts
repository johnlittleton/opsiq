// Centralized API base URL configuration
// In production (Railway), frontend and backend are on same origin
// In development browser mode, uses localhost:3000
// In Electron desktop app (including dev), connects directly to Railway unless overridden

// Hard-coded Railway URL for Electron builds
const RAILWAY_URL = 'https://opsiq-production.up.railway.app';
const LOCAL_DEV_API_URL = 'http://localhost:3000';

const isElectronRenderer = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  const electronWindow = window as typeof window & { electron?: unknown };
  return Boolean(electronWindow.electron) || navigator.userAgent.includes('Electron');
};

export const getApiBase = (): string => {
  const envApiBase = import.meta.env.VITE_API_BASE;
  if (envApiBase && typeof envApiBase === 'string' && envApiBase.trim().length > 0) {
    return envApiBase.trim();
  }

  // Electron renderer should use hosted API by default, even during dev.
  // Use VITE_API_BASE to force local API when needed.
  if (isElectronRenderer()) {
    return RAILWAY_URL;
  }

  if (import.meta.env.DEV) {
    return LOCAL_DEV_API_URL;
  }

  if (typeof window !== 'undefined') {
    const { protocol, origin } = window.location;

    // Packaged desktop/mobile shells do not host the API locally.
    if (protocol === 'file:' || protocol === 'capacitor:' || isElectronRenderer()) {
      return RAILWAY_URL;
    }

    // Browser context (web deploy/dev server).
    return origin;
  }
  
  // Fallback for development
  return LOCAL_DEV_API_URL;
};

export const API_BASE = getApiBase();

console.log('🔧 API Configuration:', {
  protocol: typeof window !== 'undefined' ? window.location.protocol : 'N/A',
  origin: typeof window !== 'undefined' ? window.location.origin : 'N/A',
  API_BASE,
});
