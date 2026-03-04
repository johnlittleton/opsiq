import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings: any) => ipcRenderer.invoke('save-settings', settings),
  getDisplays: () => ipcRenderer.invoke('get-displays'),
});

contextBridge.exposeInMainWorld('electron', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  toggleFullscreen: () => ipcRenderer.send('window-toggle-fullscreen'),
  toggleAlwaysOnTop: () => ipcRenderer.send('window-toggle-always-on-top'),
  showTouchKeyboard: () => ipcRenderer.send('show-touch-keyboard'),
  hideTouchKeyboard: () => ipcRenderer.send('hide-touch-keyboard'),
  printPage: () => ipcRenderer.invoke('print-to-pdf'),
  printHTML: (html: string) => ipcRenderer.invoke('print-to-pdf', html),
});
