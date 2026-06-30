const KEY = 'avaq-kiosk-session-id';

export const sessionService = {
  getSessionId() {
    return localStorage.getItem(KEY);
  },
  setSessionId(sessionId) {
    localStorage.setItem(KEY, sessionId);
  },
  clearSessionId() {
    localStorage.removeItem(KEY);
  },
};
