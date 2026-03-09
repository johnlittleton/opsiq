import { app, BrowserWindow, screen, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';

type UpdaterState = 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';

interface UpdaterStatusPayload {
  state: UpdaterState;
  version?: string;
  percent?: number;
  message?: string;
}

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
  // Multi-instance is ENABLED BY DEFAULT for warehouse/dock environments
  // where multiple screens are standard workflow
  
  // Check CLI flag to DISABLE multi-instance if needed
  const args = process.argv.slice(1);
  if (args.includes('--single')) return false;
  
  // Check environment variable to disable
  if (process.env.OPSIQ_MULTI_INSTANCE === 'false') return false;
  
  // Check settings file to disable
  const settings = loadSettings();
  if (settings.allowMultiInstance === false) return false;
  
  return true; // Default: ALLOW multiple instances
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
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    backgroundColor: '#1a1a1a',
    show: false,
  });

  // Remove menu bar
  mainWindow.setMenuBarVisibility(false);

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

  return mainWindow;
}

const withSenderWindow = (event: Electron.IpcMainEvent, action: (window: BrowserWindow) => void) => {
  try {
    if (!event.sender || event.sender.isDestroyed()) return;

    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return;

    if (window.isDestroyed()) return;
    action(window);
  } catch (error) {
    console.warn('Skipped window action because target was destroyed:', error);
  }
};

// Window control handlers (global, sender-targeted)
ipcMain.on('window-minimize', (event) => {
  withSenderWindow(event, (window) => window.minimize());
});

ipcMain.on('window-maximize', (event) => {
  withSenderWindow(event, (window) => {
    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }
  });
});

ipcMain.on('window-close', (event) => {
  withSenderWindow(event, (window) => window.close());
});

ipcMain.on('window-toggle-fullscreen', (event) => {
  withSenderWindow(event, (window) => window.setFullScreen(!window.isFullScreen()));
});

ipcMain.on('window-toggle-always-on-top', (event) => {
  withSenderWindow(event, (window) => {
    const isOnTop = window.isAlwaysOnTop();
    window.setAlwaysOnTop(!isOnTop);
  });
});

// ==================== AUTO-UPDATER ====================

const sendUpdaterStatus = (payload: UpdaterStatusPayload) => {
  const windows = BrowserWindow.getAllWindows();
  windows.forEach((window) => {
    if (window.isDestroyed() || window.webContents.isDestroyed()) return;
    try {
      window.webContents.send('updater-status', payload);
    } catch (error) {
      console.warn('Unable to send updater status to destroyed window:', error);
    }
  });
};

// Configure auto-updater
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

const shouldRunAutoUpdater = () => {
  if (process.env.NODE_ENV === 'development') return false;

  // Unsigned mac builds often re-download updates without successfully applying them.
  // Keep mac updater off by default to avoid endless update loops unless explicitly enabled.
  if (process.platform === 'darwin' && process.env.OPSIQ_ENABLE_MAC_AUTO_UPDATE !== 'true') {
    return false;
  }

  return true;
};

autoUpdater.on('checking-for-update', () => {
  console.log('Checking for updates...');
  sendUpdaterStatus({ state: 'checking' });
});

autoUpdater.on('update-available', (info) => {
  console.log('Update available:', info.version);
  sendUpdaterStatus({ state: 'available', version: info.version });
});

autoUpdater.on('update-not-available', () => {
  console.log('App is up to date');
  sendUpdaterStatus({ state: 'not-available' });
});

autoUpdater.on('download-progress', (progressObj) => {
  console.log(`Download progress: ${Math.round(progressObj.percent)}%`);
  sendUpdaterStatus({
    state: 'downloading',
    percent: Math.round(progressObj.percent),
  });
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('Update downloaded, will install on quit');
  sendUpdaterStatus({ state: 'downloaded', version: info.version });
});

const isMissingMacManifest404 = (message: string) => {
  const lower = message.toLowerCase();
  return lower.includes('latest-mac.yml') && lower.includes('404');
};

autoUpdater.on('error', (err) => {
  const rawMessage = err?.message || '';

  // Treat missing mac update manifest as "no update" instead of surfacing raw stack text in UI.
  if (isMissingMacManifest404(rawMessage)) {
    console.warn('Updater manifest missing for this platform. Treating as no update available.');
    sendUpdaterStatus({ state: 'not-available' });
    return;
  }

  console.error('Auto-updater error:', err);
  sendUpdaterStatus({ state: 'error', message: 'Update check failed. Please try again later.' });
});

ipcMain.on('restart-app', () => {
  autoUpdater.quitAndInstall();
});

// ==================== APP LIFECYCLE ====================

app.whenReady().then(() => {
  console.log('OpsIQ starting...');
  console.log('Multi-instance:', isMultiInstanceAllowed() ? 'ENABLED' : 'DISABLED');
  console.log('Screen argument:', getScreenArgument() || 'none');
  
  createWindow();
  
  // Check for updates 5 seconds after startup
  setTimeout(() => {
    if (shouldRunAutoUpdater()) {
      autoUpdater.checkForUpdates();
    } else if (process.platform === 'darwin') {
      sendUpdaterStatus({ state: 'not-available' });
      console.log('Mac auto-updater disabled by default. Set OPSIQ_ENABLE_MAC_AUTO_UPDATE=true to enable.');
    }
  }, 5000);

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

// ==================== TOUCH KEYBOARD ====================

ipcMain.on('show-touch-keyboard', () => {
  if (process.platform === 'win32') {
    // Path to Windows on-screen keyboard
    const tabtipPath = 'C:\\\\Program Files\\\\Common Files\\\\microsoft shared\\\\ink\\\\TabTip.exe';
    exec(`"${tabtipPath}"`, (error) => {
      if (error) {
        console.error('Failed to open touch keyboard:', error);
      }
    });
  }
});

ipcMain.on('hide-touch-keyboard', () => {
  if (process.platform === 'win32') {
    // Kill the touch keyboard process
    exec('taskkill /IM TabTip.exe /F', (error) => {
      // Ignore errors - keyboard might not be open
    });
  }
});

// ==================== PRINT HANDLING ====================

ipcMain.handle('print-to-pdf', async (event, htmlContent?: string) => {
  let webContents = event.sender;
  let tempWindow: BrowserWindow | null = null;
  
  try {
    // If HTML content is provided, create a temporary window with that content
    if (htmlContent) {
      tempWindow = new BrowserWindow({
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      });
      
      await tempWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
      webContents = tempWindow.webContents;
      
      // Wait for content to fully render
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    const data = await webContents.printToPDF({
      printBackground: true,
      landscape: false,
      pageSize: 'Letter',
      margins: {
        top: 0.4,
        bottom: 0.4,
        left: 0.4,
        right: 0.4
      }
    });
    
    // Create a temporary file path
    const pdfPath = path.join(app.getPath('temp'), `opsiq-print-${Date.now()}.pdf`);
    fs.writeFileSync(pdfPath, data);
    
    // Close temp window if created
    if (tempWindow) {
      tempWindow.close();
    }
    
    // Open the PDF in the default viewer (which will have print preview)
    exec(`"${pdfPath}"`, (error) => {
      if (error) {
        console.error('Failed to open PDF:', error);
      }
      // Clean up after 60 seconds (give time to print)
      setTimeout(() => {
        try {
          if (fs.existsSync(pdfPath)) {
            fs.unlinkSync(pdfPath);
          }
        } catch (err) {
          // Ignore cleanup errors
        }
      }, 60000);
    });
    
    return { success: true };
  } catch (error: any) {
    if (tempWindow) {
      tempWindow.close();
    }
    console.error('PDF generation failed:', error);
    return { success: false, error: error.message };
  }
});
