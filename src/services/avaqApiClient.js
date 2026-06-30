import { API_BASE } from '../renderer/services/config';

const jsonHeaders = { 'Content-Type': 'application/json' };

const asError = async (response) => {
  const payload = await response.json().catch(() => ({}));
  throw new Error(payload.error || `Request failed (${response.status})`);
};

export const avaqApiClient = {
  async createSession() {
    const response = await fetch(`${API_BASE}/api/avaq/conversation/sessions`, {
      method: 'POST',
      headers: jsonHeaders,
    });
    if (!response.ok) return asError(response);
    return response.json();
  },

  async sendTurn(sessionId, message) {
    const response = await fetch(`${API_BASE}/api/avaq/conversation/sessions/${sessionId}/turn`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ message }),
    });
    if (!response.ok) return asError(response);
    return response.json();
  },

  async synthesizeVoice(text) {
    const response = await fetch(`${API_BASE}/api/avaq/avatar/speak`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ text }),
    });
    if (!response.ok) return asError(response);
    return response.blob();
  },

  async generateAvatarVideo({ phrase, avatarImagePath, voiceId }) {
    const response = await fetch(`${API_BASE}/api/avaq/avatar/generate`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ phrase, avatarImagePath, voiceId }),
    });
    if (!response.ok) return asError(response);
    return response.json();
  },

  async prewarmCache({ avatarImagePath, voiceId }) {
    const response = await fetch(`${API_BASE}/api/avaq/avatar/cache/prewarm`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ avatarImagePath, voiceId }),
    });
    if (!response.ok) return asError(response);
    return response.json();
  },

  async getSessionSnapshot(sessionId) {
    const response = await fetch(`${API_BASE}/api/avaq/checkin/sessions/${sessionId}`);
    if (!response.ok) return asError(response);
    return response.json();
  },

  async addOverride(sessionId, by, note) {
    const response = await fetch(`${API_BASE}/api/avaq/conversation/sessions/${sessionId}/override`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ by, note }),
    });
    if (!response.ok) return asError(response);
    return response.json();
  },
};
