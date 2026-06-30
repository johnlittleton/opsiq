export class SpeechToTextService {
  constructor(private readonly openAiApiKey?: string, private readonly model: string = 'gpt-4o-mini-transcribe') {}

  async transcribeFromBase64(audioBase64?: string): Promise<string> {
    if (!audioBase64 || !audioBase64.trim() || !this.openAiApiKey) {
      return '';
    }

    const raw = audioBase64.includes(',') ? audioBase64.split(',').pop() || '' : audioBase64;
    const binary = Buffer.from(raw, 'base64');
    if (!binary.length) {
      return '';
    }

    const form = new FormData();
    const blob = new Blob([binary], { type: 'audio/webm' });
    form.append('file', blob, 'driver-audio.webm');
    form.append('model', this.model);

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.openAiApiKey}`,
      },
      body: form,
    });

    if (!response.ok) {
      const err = await response.text().catch(() => '');
      throw new Error(`STT failed ${response.status}: ${err.slice(0, 220)}`);
    }

    const payload = (await response.json()) as { text?: string };
    return String(payload.text || '').trim();
  }
}
