import fs from 'fs';
import path from 'path';

export interface AvatarJobInput {
  imagePath: string;
  audioPath: string;
  phraseHash: string;
}

export interface AvatarJobResult {
  engine: 'liveportrait' | 'sadtalker';
  videoPath: string;
}

export class TalkingAvatarService {
  private clipsDir = path.join(process.cwd(), 'data', 'avaq-clips');

  constructor(
    private readonly livePortraitUrl?: string,
    private readonly sadTalkerUrl?: string
  ) {}

  async generate(input: AvatarJobInput): Promise<AvatarJobResult> {
    fs.mkdirSync(this.clipsDir, { recursive: true });

    const liveResult = await this.tryRemoteEngine('liveportrait', this.livePortraitUrl, input);
    if (liveResult) return liveResult;

    const sadResult = await this.tryRemoteEngine('sadtalker', this.sadTalkerUrl, input);
    if (sadResult) return sadResult;

    throw new Error('No avatar engine available. Configure LIVEPORTRAIT_URL or SADTALKER_URL.');
  }

  private async tryRemoteEngine(
    engine: 'liveportrait' | 'sadtalker',
    url: string | undefined,
    input: AvatarJobInput
  ): Promise<AvatarJobResult | null> {
    if (!url) return null;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imagePath: input.imagePath,
        audioPath: input.audioPath,
        outputPath: path.join(this.clipsDir, `${input.phraseHash}-${engine}.mp4`),
      }),
    }).catch(() => null);

    if (!response || !response.ok) {
      return null;
    }

    const payload = (await response.json().catch(() => ({}))) as { videoPath?: string };
    const videoPath = String(payload.videoPath || '').trim();
    if (!videoPath || !fs.existsSync(videoPath)) {
      return null;
    }

    return {
      engine,
      videoPath,
    };
  }
}
