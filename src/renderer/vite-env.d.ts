/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface AvaQApi {
  say: (text: string) => Promise<void>;
  stop: () => void;
  think: () => void;
  alert: (text: string) => Promise<void>;
  happy: (text: string) => Promise<void>;
  speakWithBrowser?: (text: string) => Promise<void>;
  speakWithElevenLabs?: (text: string) => Promise<void>;
  provider?: 'browser' | 'elevenlabs';
}

interface Window {
  AvaQ?: AvaQApi;
}
