import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { AvaQMessage, AvaQSession, AvaQStore } from '../types';

const STORE_PATH = path.join(process.cwd(), 'data', 'avaq-store.json');

const emptyStore = (): AvaQStore => ({
  sessions: [],
  messages: [],
  clips: [],
  checkinEvents: [],
});

export class AvaQStorageService {
  private readStore(): AvaQStore {
    try {
      if (!fs.existsSync(STORE_PATH)) {
        fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
        fs.writeFileSync(STORE_PATH, JSON.stringify(emptyStore(), null, 2), 'utf8');
      }
      const raw = fs.readFileSync(STORE_PATH, 'utf8');
      const parsed = JSON.parse(raw) as AvaQStore;
      return {
        ...emptyStore(),
        ...parsed,
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
        messages: Array.isArray(parsed.messages) ? parsed.messages : [],
        clips: Array.isArray(parsed.clips) ? parsed.clips : [],
        checkinEvents: Array.isArray(parsed.checkinEvents) ? parsed.checkinEvents : [],
      };
    } catch (error) {
      console.error('AvaQ store read failed:', error);
      return emptyStore();
    }
  }

  private writeStore(store: AvaQStore): void {
    fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
  }

  getSession(sessionId: string): AvaQSession | null {
    const store = this.readStore();
    return store.sessions.find((item) => item.id === sessionId) || null;
  }

  createSession(): AvaQSession {
    const store = this.readStore();
    const now = new Date().toISOString();
    const session: AvaQSession = {
      id: randomUUID(),
      startedAt: now,
      updatedAt: now,
      status: 'active',
      context: {},
      overrideEvents: [],
    };
    store.sessions.unshift(session);
    this.writeStore(store);
    return session;
  }

  updateSession(sessionId: string, partial: Partial<AvaQSession>): AvaQSession | null {
    const store = this.readStore();
    const index = store.sessions.findIndex((item) => item.id === sessionId);
    if (index < 0) return null;

    const nextSession: AvaQSession = {
      ...store.sessions[index],
      ...partial,
      context: {
        ...store.sessions[index].context,
        ...(partial.context || {}),
      },
      updatedAt: new Date().toISOString(),
    };

    store.sessions[index] = nextSession;
    this.writeStore(store);
    return nextSession;
  }

  appendMessage(sessionId: string, speaker: AvaQMessage['speaker'], text: string): AvaQMessage {
    const store = this.readStore();
    const message: AvaQMessage = {
      id: randomUUID(),
      sessionId,
      speaker,
      text: String(text || '').trim(),
      createdAt: new Date().toISOString(),
    };
    store.messages.push(message);
    this.writeStore(store);
    return message;
  }

  listMessages(sessionId: string, limit: number = 25): AvaQMessage[] {
    const store = this.readStore();
    return store.messages.filter((item) => item.sessionId === sessionId).slice(-limit);
  }

  saveCheckinEvent(sessionId: string, status: string, payload: Record<string, unknown>): void {
    const store = this.readStore();
    store.checkinEvents.push({
      id: randomUUID(),
      sessionId,
      status,
      payload,
      createdAt: new Date().toISOString(),
    });
    this.writeStore(store);
  }

  getStoreSnapshot(): AvaQStore {
    return this.readStore();
  }

  replaceStore(nextStore: AvaQStore): void {
    this.writeStore(nextStore);
  }
}
