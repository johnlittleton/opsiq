export type AvatarBrainState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'confused'
  | 'happy'
  | 'concerned';

export interface AvatarTurn {
  role: 'user' | 'assistant';
  content: string;
  at: number;
}

export interface AvatarMemory {
  driverName?: string;
  company?: string;
  preferredShortPhrasing: boolean;
  lastIntents: string[];
  unresolvedTasks: string[];
  turns: AvatarTurn[];
}

export interface AvatarSnapshot {
  state: AvatarBrainState;
  memory: AvatarMemory;
  lastMessage: string;
}

type SnapshotListener = (snapshot: AvatarSnapshot) => void;

const sentimentToState = (text: string): AvatarBrainState => {
  const lower = text.toLowerCase();

  if (/(not sure|uncertain|maybe|cannot confirm|can't confirm|could be|i think)/.test(lower)) {
    return 'concerned';
  }

  if (/(error|failed|issue|problem|alert|urgent|blocked|warning)/.test(lower)) {
    return 'concerned';
  }

  if (/(great|done|completed|success|perfect|all set|ready)/.test(lower)) {
    return 'happy';
  }

  if (/(confused|didn't understand|do not understand|clarify|repeat)/.test(lower)) {
    return 'confused';
  }

  return 'speaking';
};

export class AvatarStateMachine {
  private state: AvatarBrainState = 'idle';
  private readonly memory: AvatarMemory = {
    preferredShortPhrasing: true,
    lastIntents: [],
    unresolvedTasks: [],
    turns: [],
  };
  private listeners = new Set<SnapshotListener>();
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly idleTimeoutMs: number;
  private lastMessage = 'Ava is ready.';

  constructor(idleTimeoutMs = 20000) {
    this.idleTimeoutMs = idleTimeoutMs;
    this.bumpIdleTimer();
  }

  subscribe(listener: SnapshotListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    this.listeners.clear();
  }

  setIdentity(driverName?: string, company?: string): void {
    this.memory.driverName = driverName?.trim() || undefined;
    this.memory.company = company?.trim() || undefined;
    this.emit();
  }

  setPreferredShortPhrasing(short: boolean): void {
    this.memory.preferredShortPhrasing = short;
    this.emit();
  }

  setUnresolvedTasks(tasks: string[]): void {
    this.memory.unresolvedTasks = tasks.slice(0, 6);
    this.emit();
  }

  registerIntent(intent: string): void {
    const clean = intent.trim();
    if (!clean) return;
    this.memory.lastIntents = [clean, ...this.memory.lastIntents.filter((it) => it !== clean)].slice(0, 3);
    this.emit();
  }

  onUserInput(message: string, intent = 'general'): void {
    const clean = message.trim();
    if (!clean) return;
    this.pushTurn('user', clean);
    this.registerIntent(intent);
    this.lastMessage = clean;
    this.transition('listening');
  }

  onAiRequestStarted(): void {
    this.transition('thinking');
  }

  onAiReply(reply: string, intent = 'assistant-reply'): AvatarBrainState {
    const clean = reply.trim();
    if (clean) {
      this.pushTurn('assistant', clean);
      this.lastMessage = clean;
      this.registerIntent(intent);
    }
    const next = sentimentToState(clean);
    this.transition(next);
    return next;
  }

  onSpeechStarted(): void {
    this.transition('speaking');
  }

  onSpeechFinished(): void {
    this.transition('idle');
  }

  onInterrupt(): void {
    this.transition('listening');
  }

  forceState(state: AvatarBrainState): void {
    this.transition(state);
  }

  getSnapshot(): AvatarSnapshot {
    return this.snapshot();
  }

  private transition(next: AvatarBrainState): void {
    this.state = next;
    this.bumpIdleTimer();
    this.emit();
  }

  private pushTurn(role: 'user' | 'assistant', content: string): void {
    this.memory.turns = [...this.memory.turns, { role, content, at: Date.now() }].slice(-16);
  }

  private bumpIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }
    this.idleTimer = setTimeout(() => {
      this.state = 'idle';
      this.emit();
    }, this.idleTimeoutMs);
  }

  private snapshot(): AvatarSnapshot {
    return {
      state: this.state,
      memory: {
        driverName: this.memory.driverName,
        company: this.memory.company,
        preferredShortPhrasing: this.memory.preferredShortPhrasing,
        lastIntents: [...this.memory.lastIntents],
        unresolvedTasks: [...this.memory.unresolvedTasks],
        turns: [...this.memory.turns],
      },
      lastMessage: this.lastMessage,
    };
  }

  private emit(): void {
    const shot = this.snapshot();
    this.listeners.forEach((listener) => listener(shot));
  }
}
