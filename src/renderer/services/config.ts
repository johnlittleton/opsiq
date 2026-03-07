// Centralized API base URL configuration
// In production (Railway), frontend and backend are on same origin
// In development, uses localhost:3000
// In Electron desktop app, connects directly to Railway

// Hard-coded Railway URL for Electron builds
const RAILWAY_URL = 'https://opsiq-production.up.railway.app';

export const getApiBase = (): string => {
  if (typeof window !== 'undefined') {
    const { protocol, origin } = window.location;

    // Packaged desktop/mobile shells do not host the API locally.
    if (protocol === 'file:' || protocol === 'capacitor:') {
      return RAILWAY_URL;
    }

    // Browser context (web deploy/dev server).
    return origin;
  }
  
  // Fallback for development
  return 'http://localhost:3000';
};

export const API_BASE = getApiBase();

console.log('🔧 API Configuration:', {
  protocol: typeof window !== 'undefined' ? window.location.protocol : 'N/A',
  origin: typeof window !== 'undefined' ? window.location.origin : 'N/A',
  API_BASE,
});
