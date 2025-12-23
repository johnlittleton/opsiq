export interface IElectronAPI {
  getAppVersion: () => Promise<string>;
  getSettings: () => Promise<any>;
  saveSettings: (settings: any) => Promise<void>;
  getDisplays: () => Promise<any[]>;
}

export interface IElectron {
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  toggleFullscreen?: () => void;
  toggleAlwaysOnTop?: () => void;
  showTouchKeyboard?: () => void;
  hideTouchKeyboard?: () => void;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
    electron: IElectron;
  }
}

export {};