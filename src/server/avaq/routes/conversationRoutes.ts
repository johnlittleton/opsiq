import { Router } from 'express';
import { AvaQConversationService } from '../services/conversationService';
import { SpeechToTextService } from '../services/speechToTextService';

export const createConversationRoutes = (
  conversation: AvaQConversationService,
  stt: SpeechToTextService
): Router => {
  const router = Router();

  router.post('/sessions', async (_req, res) => {
    try {
      const session = await conversation.createSession();
      res.status(201).json(session);
    } catch (error: any) {
      res.status(500).json({ error: String(error?.message || error) });
    }
  });

  router.post('/transcribe', async (req, res) => {
    try {
      const text = await stt.transcribeFromBase64(req.body?.audioBase64);
      res.json({ text });
    } catch (error: any) {
      res.status(500).json({ error: String(error?.message || error) });
    }
  });

  router.post('/sessions/:sessionId/turn', async (req, res) => {
    try {
      const result = await conversation.processTurn(req.params.sessionId, req.body?.message);
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: String(error?.message || error) });
    }
  });

  router.post('/sessions/:sessionId/override', async (req, res) => {
    try {
      const session = await conversation.addOverride(
        req.params.sessionId,
        String(req.body?.by || 'staff'),
        String(req.body?.note || 'Manual override')
      );
      res.json(session);
    } catch (error: any) {
      res.status(400).json({ error: String(error?.message || error) });
    }
  });

  return router;
};
