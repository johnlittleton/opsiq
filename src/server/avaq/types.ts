export type AvaQSpeaker = 'driver' | 'avaq' | 'system';

export interface AvaQMessage {
  id: string;
  sessionId: string;
  speaker: AvaQSpeaker;
  text: string;
  createdAt: string;
}

export interface AvaQSession {
  id: string;
  startedAt: string;
  updatedAt: string;
  status: 'active' | 'completed' | 'escalated';
  context: {
    driverName?: string;
    carrierName?: string;
    appointmentNumber?: string;
    movementType?: 'pickup' | 'delivery' | 'unknown';
    doorNumber?: number;
    appointmentFound?: boolean;
    lateArrival?: boolean;
    paperworkMissing?: boolean;
    waitingInstruction?: string;
    checkinId?: number;
    appointmentId?: number;
  };
  overrideEvents: Array<{
    at: string;
    by: string;
    note: string;
  }>;
}

export interface CachedClip {
  id: string;
  phrase: string;
  avatarImagePath: string;
  voiceId: string;
  videoPath: string;
  createdAt: string;
  updatedAt: string;
}

export interface AvaQStore {
  sessions: AvaQSession[];
  messages: AvaQMessage[];
  clips: CachedClip[];
  checkinEvents: Array<{
    id: string;
    sessionId: string;
    status: string;
    createdAt: string;
    payload: Record<string, unknown>;
  }>;
}
