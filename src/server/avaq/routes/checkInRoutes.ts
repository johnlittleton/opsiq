import { Router } from 'express';
import { AvaQStorageService } from '../services/storageService';

export const createCheckInRoutes = (storage: AvaQStorageService): Router => {
  const router = Router();

  router.get('/sessions/:sessionId', (req, res) => {
    const session = storage.getSession(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: 'session not found' });
    }

    const messages = storage.listMessages(req.params.sessionId, 80);
    res.json({ session, messages });
  });

  router.get('/storage/snapshot', (_req, res) => {
    res.json(storage.getStoreSnapshot());
  });

  return router;
};
