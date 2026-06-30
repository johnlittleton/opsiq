import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import { ClipCacheService } from '../services/clipCacheService';
import { TextToSpeechService } from '../services/textToSpeechService';

export const createAvatarRoutes = (clipCache: ClipCacheService, tts: TextToSpeechService): Router => {
  const router = Router();

  router.post('/speak', async (req, res) => {
    try {
      const text = String(req.body?.text || '').trim();
      if (!text) {
        return res.status(400).json({ error: 'text is required' });
      }

      const audio = await tts.synthesize(text);
      if (!audio) {
        return res.status(503).json({ error: 'TTS service unavailable' });
      }

      res.setHeader('Content-Type', 'audio/mpeg');
      res.send(audio);
    } catch (error: any) {
      res.status(500).json({ error: String(error?.message || error) });
    }
  });

  router.post('/generate', async (req, res) => {
    try {
      const phrase = String(req.body?.phrase || '').trim();
      const avatarImagePath = String(req.body?.avatarImagePath || '').trim();
      const voiceId = String(req.body?.voiceId || 'avaq-default').trim();

      if (!phrase || !avatarImagePath) {
        return res.status(400).json({ error: 'phrase and avatarImagePath are required' });
      }

      const videoPath = await clipCache.getOrCreateClip(phrase, voiceId, avatarImagePath);
      res.json({ videoPath });
    } catch (error: any) {
      res.status(500).json({ error: String(error?.message || error) });
    }
  });

  router.get('/clip', async (req, res) => {
    try {
      const videoPath = String(req.query.path || '').trim();
      if (!videoPath || !fs.existsSync(videoPath)) {
        return res.status(404).json({ error: 'clip not found' });
      }

      const safeRoot = path.join(process.cwd(), 'data', 'avaq-clips');
      const normalized = path.resolve(videoPath);
      if (!normalized.startsWith(path.resolve(safeRoot))) {
        return res.status(400).json({ error: 'invalid clip path' });
      }

      res.sendFile(normalized);
    } catch (error: any) {
      res.status(500).json({ error: String(error?.message || error) });
    }
  });

  router.post('/cache/prewarm', async (req, res) => {
    try {
      const voiceId = String(req.body?.voiceId || 'avaq-default').trim();
      const avatarImagePath = String(req.body?.avatarImagePath || '').trim();
      if (!avatarImagePath) {
        return res.status(400).json({ error: 'avatarImagePath is required' });
      }

      const result = await clipCache.prewarmCommonPhrases(voiceId, avatarImagePath);
      res.json({ result });
    } catch (error: any) {
      res.status(500).json({ error: String(error?.message || error) });
    }
  });

  return router;
};
