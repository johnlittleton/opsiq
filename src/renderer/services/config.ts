// Centralized API base URL configuration
// In production (Railway), frontend and backend are on same origin
// In development, uses localhost:3000
// In Electron, uses environment variable

export const getApiBase = (): string => {
  // If environment variable is explicitly set, use it
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  // In browser context, use current origin (works for Railway)
  if (typeof window !== 'undefined' && window.location.origin !== 'file://') {
    return window.location.origin;
  }
  
  // Fallback for development or file:// protocol
  return 'http://localhost:3000';
};

export const API_BASE = getApiBase();

console.log('🔧 API Configuration:', {
  VITE_API_URL: import.meta.env.VITE_API_URL,
  windowOrigin: typeof window !== 'undefined' ? window.location.origin : 'N/A',
  API_BASE,
});
