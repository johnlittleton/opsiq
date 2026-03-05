export interface IElectronAPI {
  getAppVersion: () => Promise<string>;
  getSettings: () => Promise<any>;
  saveSettings: (settings: any) => Promise<void>;
  getDisplays: () => Promise<any[]>;
  onUpdaterStatus?: (callback: (status: {
    state: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
    version?: string;
    percent?: number;
    message?: string;
  }) => void) => (() => void);
  restartApp?: () => void;
}

export interface IElectron {
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  toggleFullscreen?: () => void;
  toggleAlwaysOnTop?: () => void;
  showTouchKeyboard?: () => void;
  hideTouchKeyboard?: () => void;
  printPage?: () => Promise<{ success: boolean; error?: string }>;
  printHTML?: (html: string) => Promise<{ success: boolean; error?: string }>;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
    electron: IElectron;
  }
}

export {};