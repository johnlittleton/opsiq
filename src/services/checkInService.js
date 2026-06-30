import { avaqApiClient } from './avaqApiClient';

export const checkInService = {
  async submitDriverMessage(sessionId, message) {
    return avaqApiClient.sendTurn(sessionId, message);
  },
};
