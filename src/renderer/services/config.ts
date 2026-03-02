// Centralized API base URL configuration
// In production (Railway), frontend and backend are on same origin
// In development, uses localhost:3000
// In Electron desktop app, connects directly to Railway

// Hard-coded Railway URL for Electron builds
const RAILWAY_URL = 'https://opsiq-production.up.railway.app';

export const getApiBase = (): string => {
  // In Electron (file:// protocol), always use Railway
  if (typeof window !== 'undefined' && window.location.origin === 'file://') {
    return RAILWAY_URL;
  }
  
  // In browser context, use current origin (works for Railway web deployment)
  if (typeof window !== 'undefined') {
    return window.location.origin;
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
