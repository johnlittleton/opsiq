interface OpenAiReplyInput {
  sessionSummary: string;
  driverMessage: string;
  context: Record<string, unknown>;
}

interface OpenAiReplyOutput {
  text: string;
  statusTag: 'continue' | 'complete' | 'escalate';
}

export class OpenAiService {
  constructor(private readonly apiKey?: string, private readonly model: string = 'gpt-4o-mini') {}

  async reply(input: OpenAiReplyInput): Promise<OpenAiReplyOutput> {
    if (!this.apiKey) {
      return {
        text: 'Please provide your appointment number, carrier name, and driver name so I can continue your check-in.',
        statusTag: 'continue',
      };
    }

    const systemPrompt = [
      'You are AvaQ, an AI driver check-in kiosk assistant for OPSIQ shipping and receiving.',
      'Collect appointment number, carrier name, driver name, and movement type (pickup or delivery).',
      'If appointment missing, instruct driver to see shipping office and set escalate intent.',
      'If check-in complete, provide concise confirmation.',
      'Return JSON only: {"text": string, "statusTag": "continue"|"complete"|"escalate" }',
    ].join(' ');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.3,
        max_tokens: 220,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Session summary: ${input.sessionSummary}` },
          { role: 'user', content: `Context JSON: ${JSON.stringify(input.context)}` },
          { role: 'user', content: `Driver message: ${input.driverMessage}` },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`OpenAI response ${response.status}: ${errText.slice(0, 240)}`);
    }

    const payload = (await response.json()) as any;
    const raw = String(payload?.choices?.[0]?.message?.content || '').trim();
    const parsed = this.safeParse(raw);

    return {
      text: String(parsed?.text || raw || 'I can help once you share your appointment details.').slice(0, 900),
      statusTag: parsed?.statusTag === 'complete' || parsed?.statusTag === 'escalate' ? parsed.statusTag : 'continue',
    };
  }

  private safeParse(raw: string): any {
    try {
      return JSON.parse(raw);
    } catch {
      const first = raw.indexOf('{');
      const last = raw.lastIndexOf('}');
      if (first >= 0 && last > first) {
        try {
          return JSON.parse(raw.slice(first, last + 1));
        } catch {
          return null;
        }
      }
      return null;
    }
  }
}
