// Centralized API base URL configuration
// In production (Railway), frontend and backend are on same origin.
// In development browser mode, default to localhost:3000.
// In development Electron mode, default to Railway to mirror deployed desktop behavior.
// Optional overrides:
// - VITE_FORCE_LOCAL_DEV_API=true   -> force localhost in dev
// - VITE_FORCE_RAILWAY_DEV_API=true -> force Railway in dev

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

  const forceLocalDevApi = String(import.meta.env.VITE_FORCE_LOCAL_DEV_API || '').toLowerCase() === 'true';
  const forceRailwayDevApi = String(import.meta.env.VITE_FORCE_RAILWAY_DEV_API || '').toLowerCase() === 'true';

  // Dev defaults:
  // - Browser dev: local API
  // - Electron dev: Railway API (parity with deployed desktop app)
  if (import.meta.env.DEV) {
    if (forceRailwayDevApi) {
      return RAILWAY_URL;
    }

    if (forceLocalDevApi) {
      return LOCAL_DEV_API_URL;
    }

    if (isElectronRenderer()) {
      return RAILWAY_URL;
    }

    return LOCAL_DEV_API_URL;
  }

  // Electron renderer should use hosted API by default, even during dev.
  // Use VITE_API_BASE to force local API when needed.
  if (isElectronRenderer()) {
    return RAILWAY_URL;
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
