export class TextToSpeechService {
  constructor(
    private readonly elevenApiKey?: string,
    private readonly voiceId: string = 'xctasy8XvGp2cVO9HL9k',
    private readonly modelId: string = 'eleven_multilingual_v2'
  ) {}

  async synthesize(text: string): Promise<Buffer | null> {
    if (!this.elevenApiKey) return null;

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
        'xi-api-key': this.elevenApiKey,
      },
      body: JSON.stringify({
        text: String(text || '').slice(0, 900),
        model_id: this.modelId,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`TTS failed ${response.status}: ${body.slice(0, 220)}`);
    }

    const arr = await response.arrayBuffer();
    return Buffer.from(arr);
  }
}
