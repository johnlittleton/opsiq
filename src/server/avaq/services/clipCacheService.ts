import fs from 'fs';
import path from 'path';
import { createHash, randomUUID } from 'crypto';
import { AvaQStorageService } from './storageService';
import { TextToSpeechService } from './textToSpeechService';
import { TalkingAvatarService } from './talkingAvatarService';

const COMMON_PHRASES = [
  'Welcome to OPSIQ. Are you here for driver check-in?',
  'Please say or enter your appointment number.',
  'Thank you. I found your appointment.',
  'Please proceed to Door {doorNumber}.',
  'I could not find that appointment. Please see shipping.',
  'Please wait while I notify the shipping office.',
  'Your check-in is complete.',
];

export class ClipCacheService {
  private clipsRoot = path.join(process.cwd(), 'data', 'avaq-clips');

  constructor(
    private readonly storage: AvaQStorageService,
    private readonly ttsService: TextToSpeechService,
    private readonly avatarService: TalkingAvatarService
  ) {}

  hashPhrase(phrase: string, voiceId: string, avatarPath: string): string {
    return createHash('sha1').update(`${phrase}|${voiceId}|${avatarPath}`).digest('hex');
  }

  findClip(phrase: string, voiceId: string, avatarPath: string): string | null {
    const hash = this.hashPhrase(phrase, voiceId, avatarPath);
    const snapshot = this.storage.getStoreSnapshot();
    const hit = snapshot.clips.find((clip) => clip.id === hash && fs.existsSync(clip.videoPath));
    return hit?.videoPath || null;
  }

  async getOrCreateClip(phrase: string, voiceId: string, avatarPath: string): Promise<string> {
    const hash = this.hashPhrase(phrase, voiceId, avatarPath);
    const existing = this.findClip(phrase, voiceId, avatarPath);
    if (existing) return existing;

    fs.mkdirSync(this.clipsRoot, { recursive: true });
    const audio = await this.ttsService.synthesize(phrase);
    if (!audio) {
      throw new Error('Unable to synthesize clip audio.');
    }

    const tempAudioPath = path.join(this.clipsRoot, `${randomUUID()}.mp3`);
    fs.writeFileSync(tempAudioPath, audio);

    try {
      const avatarResult = await this.avatarService.generate({
        imagePath: avatarPath,
        audioPath: tempAudioPath,
        phraseHash: hash,
      });

      const nextStore = this.storage.getStoreSnapshot();
      const now = new Date().toISOString();
      nextStore.clips = nextStore.clips.filter((item) => item.id !== hash);
      nextStore.clips.push({
        id: hash,
        phrase,
        avatarImagePath: avatarPath,
        voiceId,
        videoPath: avatarResult.videoPath,
        createdAt: now,
        updatedAt: now,
      });
      this.storage.replaceStore(nextStore);

      return avatarResult.videoPath;
    } finally {
      if (fs.existsSync(tempAudioPath)) fs.unlinkSync(tempAudioPath);
    }
  }

  async prewarmCommonPhrases(voiceId: string, avatarPath: string): Promise<Array<{ phrase: string; ok: boolean; error?: string }>> {
    const output: Array<{ phrase: string; ok: boolean; error?: string }> = [];

    for (const phrase of COMMON_PHRASES) {
      try {
        await this.getOrCreateClip(phrase, voiceId, avatarPath);
        output.push({ phrase, ok: true });
      } catch (error: any) {
        output.push({ phrase, ok: false, error: String(error?.message || error) });
      }
    }

    return output;
  }
}
