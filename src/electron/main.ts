import { app, BrowserWindow, screen, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';

// ==================== CONFIGURATION ====================

interface WindowConfig {
  display?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

interface AppSettings {
  allowMultiInstance?: boolean;
  windowPresets?: Record<string, WindowConfig>;
}

const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');
const ICON_PATH = path.join(__dirname, '../../assets/OpsIQ.ico');

// ==================== MULTI-INSTANCE LOGIC ====================

function loadSettings(): AppSettings {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
  return {};
}

function isMultiInstanceAllowed(): boolean {
  // Check CLI flags
  const args = process.argv.slice(1);
  if (args.includes('--multi')) return true;
  
  // Check environment variable
  if (process.env.OPSIQ_MULTI_INSTANCE === 'true') return true;
  
  // Check settings file
  const settings = loadSettings();
  if (settings.allowMultiInstance) return true;
  
  return false;
}

function getScreenArgument(): string | null {
  const args = process.argv.slice(1);
  const screenArg = args.find(arg => arg.startsWith('--screen='));
  return screenArg ? screenArg.split('=')[1] : null;
}

function getWindowConfig(): WindowConfig {
  const args = process.argv.slice(1);
  const config: WindowConfig = {};

  args.forEach(arg => {
    if (arg.startsWith('--display=')) {
      config.display = parseInt(arg.split('=')[1]);
    } else if (arg.startsWith('--x=')) {
      config.x = parseInt(arg.split('=')[1]);
    } else if (arg.startsWith('--y=')) {
      config.y = parseInt(arg.split('=')[1]);
    } else if (arg.startsWith('--w=')) {
      config.width = parseInt(arg.split('=')[1]);
    } else if (arg.startsWith('--h=')) {
      config.height = parseInt(arg.split('=')[1]);
    }
  });

  return config;
}

// ==================== SINGLE INSTANCE LOCK ====================

if (!isMultiInstanceAllowed()) {
  const gotTheLock = app.requestSingleInstanceLock();

  if (!gotTheLock) {
    console.log('OpsIQ is already running. Only one instance allowed.');
    app.quit();
  } else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
      // Focus the existing window
      const windows = BrowserWindow.getAllWindows();
      if (windows.length > 0) {
        const mainWindow = windows[0];
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });
  }
}

// ==================== WINDOW CREATION ====================

function createWindow() {
  const displays = screen.getAllDisplays();
  const windowConfig = getWindowConfig();
  const settings = loadSettings();
  
  // Determine target display
  let targetDisplay = displays[0];
  if (windowConfig.display !== undefined && displays[windowConfig.display]) {
    targetDisplay = displays[windowConfig.display];
  }

  // Default window bounds
  let bounds = {
    x: targetDisplay.bounds.x + 50,
    y: targetDisplay.bounds.y + 50,
    width: 1400,
    height: 900,
  };

  // Apply custom position/size
  if (windowConfig.x !== undefined) bounds.x = windowConfig.x;
  if (windowConfig.y !== undefined) bounds.y = windowConfig.y;
  if (windowConfig.width !== undefined) bounds.width = windowConfig.width;
  if (windowConfig.height !== undefined) bounds.height = windowConfig.height;

  const mainWindow = new BrowserWindow({
    ...bounds,
    icon: fs.existsSync(ICON_PATH) ? ICON_PATH : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    backgroundColor: '#1a1a1a',
    show: false,
  });

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Load URL based on environment
  const screenArg = getScreenArgument();
  let url: string;

  if (process.env.NODE_ENV === 'development') {
    url = 'http://localhost:5173';
    if (screenArg) {
      url += `/#/${screenArg}`;
    }
  } else {
    url = `file://${path.join(__dirname, '../renderer/index.html')}`;
    if (screenArg) {
      url += `#/${screenArg}`;
    }
  }

  mainWindow.loadURL(url);

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  return mainWindow;
}

// ==================== APP LIFECYCLE ====================

app.whenReady().then(() => {
  console.log('OpsIQ starting...');
  console.log('Multi-instance:', isMultiInstanceAllowed() ? 'ENABLED' : 'DISABLED');
  console.log('Screen argument:', getScreenArgument() || 'none');
  
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ==================== IPC HANDLERS ====================

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-settings', () => {
  return loadSettings();
});

ipcMain.handle('save-settings', (event, settings: AppSettings) => {
  try {
    const dir = path.dirname(SETTINGS_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
    return { success: true };
  } catch (error: any) {
    console.error('Error saving settings:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-displays', () => {
  return screen.getAllDisplays().map((display, index) => ({
    id: index,
    bounds: display.bounds,
    workArea: display.workArea,
    primary: display.bounds.x === 0 && display.bounds.y === 0,
  }));
});
