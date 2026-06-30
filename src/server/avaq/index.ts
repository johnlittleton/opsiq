import { Router } from 'express';
import { createAvatarRoutes } from './routes/avatarRoutes';
import { createConversationRoutes } from './routes/conversationRoutes';
import { createCheckInRoutes } from './routes/checkInRoutes';
import { AvaQStorageService } from './services/storageService';
import { OpenAiService } from './services/openAiService';
import { SpeechToTextService } from './services/speechToTextService';
import { TextToSpeechService } from './services/textToSpeechService';
import { TalkingAvatarService } from './services/talkingAvatarService';
import { ClipCacheService } from './services/clipCacheService';
import { OpsiqCheckInService } from './services/opsiqCheckInService';
import { AvaQConversationService } from './services/conversationService';

interface AvaQRouterOptions {
  db: any;
  openAiApiKey?: string;
  openAiModel?: string;
  elevenLabsApiKey?: string;
  elevenLabsVoiceId?: string;
  elevenLabsModelId?: string;
  livePortraitUrl?: string;
  sadTalkerUrl?: string;
}

export const createAvaQRouter = (options: AvaQRouterOptions): Router => {
  const router = Router();

  const storage = new AvaQStorageService();
  const openAi = new OpenAiService(options.openAiApiKey, options.openAiModel || 'gpt-4o-mini');
  const stt = new SpeechToTextService(options.openAiApiKey);
  const tts = new TextToSpeechService(
    options.elevenLabsApiKey,
    options.elevenLabsVoiceId,
    options.elevenLabsModelId
  );
  const avatar = new TalkingAvatarService(options.livePortraitUrl, options.sadTalkerUrl);
  const clipCache = new ClipCacheService(storage, tts, avatar);
  const checkIn = new OpsiqCheckInService(options.db);
  const conversation = new AvaQConversationService(storage, openAi, checkIn);

  router.use('/conversation', createConversationRoutes(conversation, stt));
  router.use('/avatar', createAvatarRoutes(clipCache, tts));
  router.use('/checkin', createCheckInRoutes(storage));

  return router;
};
