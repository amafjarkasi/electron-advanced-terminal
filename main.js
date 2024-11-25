const electron = require('electron');
const { app, BrowserWindow, ipcMain, Menu } = electron;
const path = require('path');
const fs = require('fs').promises;
const axios = require('axios');
const simpleGit = require('simple-git');
const si = require('systeminformation');
const os = require('os');
const dialog = require('electron').dialog;

// Initialize @electron/remote
require('@electron/remote/main').initialize();

// Enable hot reload for development
try {
    require('electron-reloader')(module, {
        debug: true,
        watchRenderer: true
    });
} catch (_) { console.log('Error loading electron-reloader'); }

// Keep a global reference of the window object
let mainWindow;
const CONFIG_DIR = path.join(os.homedir(), '.terminal_config');
const WINDOW_STATE_FILE = path.join(CONFIG_DIR, 'window-state.json');

// Default window state
const defaultWindowState = {
    width: 1200,
    height: 800, // Increased from previous value
    x: undefined,
    y: undefined,
    isMaximized: false
};

async function ensureConfigDir() {
    try {
        await fs.access(CONFIG_DIR);
    } catch {
        await fs.mkdir(CONFIG_DIR, { recursive: true });
    }
}

async function loadWindowState() {
    try {
        await ensureConfigDir();
        const data = await fs.readFile(WINDOW_STATE_FILE, 'utf8');
        return { ...defaultWindowState, ...JSON.parse(data) };
    } catch (error) {
        return defaultWindowState;
    }
}

async function saveWindowState(windowState) {
    try {
        await ensureConfigDir();
        await fs.writeFile(WINDOW_STATE_FILE, JSON.stringify(windowState, null, 2));
    } catch (error) {
        console.error('Failed to save window state:', error);
    }
}

async function createWindow() {
    const windowState = await loadWindowState();
    mainWindow = new BrowserWindow({
        width: windowState.width,
        height: 768,
        x: windowState.x,
        y: windowState.y,
        frame: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true
        }
    });

    if (windowState.isMaximized) {
        mainWindow.maximize();
    }

    mainWindow.loadFile('index.html');
    
    mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.openDevTools();
    });

    // Add keyboard shortcut for DevTools
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.control && input.key.toLowerCase() === 'i') {
            event.preventDefault();
        }
    });

    // Save window state on close
    mainWindow.on('close', async () => {
        const isMaximized = mainWindow.isMaximized();
        const bounds = mainWindow.getBounds();

        await saveWindowState({
            width: bounds.width,
            height: bounds.height,
            x: bounds.x,
            y: bounds.y,
            isMaximized
        });
    });

    // Save window state when maximized/unmaximized
    mainWindow.on('maximize', async () => {
        const bounds = mainWindow.getBounds();
        await saveWindowState({
            width: bounds.width,
            height: bounds.height,
            x: bounds.x,
            y: bounds.y,
            isMaximized: true
        });
    });

    mainWindow.on('unmaximize', async () => {
        const bounds = mainWindow.getBounds();
        await saveWindowState({
            width: bounds.width,
            height: bounds.height,
            x: bounds.x,
            y: bounds.y,
            isMaximized: false
        });
    });

    // Save window state periodically during resize
    let resizeTimeout;
    mainWindow.on('resize', () => {
        if (!mainWindow.isMaximized()) {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(async () => {
                const bounds = mainWindow.getBounds();
                await saveWindowState({
                    width: bounds.width,
                    height: bounds.height,
                    x: bounds.x,
                    y: bounds.y,
                    isMaximized: false
                });
            }, 500); // Debounce resize events
        }
    });

    // Save window state during move
    let moveTimeout;
    mainWindow.on('move', () => {
        if (!mainWindow.isMaximized()) {
            clearTimeout(moveTimeout);
            moveTimeout = setTimeout(async () => {
                const bounds = mainWindow.getBounds();
                await saveWindowState({
                    width: bounds.width,
                    height: bounds.height,
                    x: bounds.x,
                    y: bounds.y,
                    isMaximized: false
                });
            }, 500); // Debounce move events
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// This method will be called when Electron has finished initialization
app.whenReady().then(createWindow);

// Window control handlers
ipcMain.on('window-minimize', () => {
    mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
    if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
    } else {
        mainWindow.maximize();
    }
});

ipcMain.on('window-close', () => {
    mainWindow.close();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// Utility Functions for IPC
ipcMain.handle('read-file', async (event, filePath) => {
    try {
        return await fs.readFile(filePath, 'utf8');
    } catch (error) {
        return { error: error.message };
    }
});

ipcMain.handle('test-api', async (event, url, method, data) => {
    try {
        const response = await axios({
            method: method || 'get',
            url,
            data
        });
        return response.data;
    } catch (error) {
        return { error: error.message };
    }
});

ipcMain.handle('git-operations', async (event, operation, repoPath, args) => {
    try {
        const git = simpleGit(repoPath);
        switch(operation) {
            case 'status': return await git.status();
            case 'pull': return await git.pull();
            case 'commit': return await git.commit(args.message);
            default: return { error: 'Unsupported operation' };
        }
    } catch (error) {
        return { error: error.message };
    }
});

ipcMain.handle('system-info', async () => {
    try {
        return {
            cpu: await si.cpu(),
            memory: await si.mem(),
            os: await si.osInfo()
        };
    } catch (error) {
        return { error: error.message };
    }
});

// Terminal handling
let currentDirectory = os.homedir();

// Get current directory
ipcMain.handle('get-current-directory', () => {
    return currentDirectory;
});

ipcMain.handle('run-terminal-command', async (event, command) => {
    try {
        // Handle CD commands specially
        if (command.toLowerCase().startsWith('cd ')) {
            const newPath = command.slice(3).trim().replace(/^["']|["']$/g, '');
            const targetPath = path.resolve(currentDirectory, newPath);
            
            try {
                // Use fs.stat instead of fs.access to ensure it's a directory
                const stats = await fs.stat(targetPath);
                if (!stats.isDirectory()) {
                    return { success: false, error: 'Not a directory' };
                }
                currentDirectory = targetPath;
                return { success: true, output: '' };
            } catch (error) {
                return { success: false, error: 'Directory not found' };
            }
        }

        // For all other commands, use PowerShell
        return new Promise((resolve) => {
            const { exec } = require('child_process');
            // Use proper PowerShell escaping for paths with spaces
            const escapedPath = currentDirectory.replace(/'/g, "''");
            
            // Execute command directly in PowerShell with simpler error handling
            const psCommand = `powershell.exe -NoProfile -Command "cd '${escapedPath}'; ${command}"`;
            
            exec(psCommand, (error, stdout, stderr) => {
                if (error) {
                    resolve({
                        success: false,
                        error: stderr.trim() || error.message || 'Command failed'
                    });
                } else {
                    resolve({
                        success: true,
                        output: stdout
                    });
                }
            });
        });
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
});

// Settings management
const CONFIG_FILE = path.join(app.getPath('userData'), 'settings.json');
const DEFAULT_SETTINGS = {
    defaultDirectory: app.getPath('home'),
    fontSize: 14,
    fontFamily: 'Consolas',
    backgroundColor: '#000000',
    textColor: '#ffffff',
    clearOnClose: false,
    saveCommandHistory: true
};

async function loadSettings() {
    try {
        await fs.access(CONFIG_FILE);
        const data = await fs.readFile(CONFIG_FILE, 'utf8');
        return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
    } catch (error) {
        return DEFAULT_SETTINGS;
    }
}

async function saveSettings(settings) {
    try {
        await fs.mkdir(path.dirname(CONFIG_FILE), { recursive: true });
        await fs.writeFile(CONFIG_FILE, JSON.stringify(settings, null, 2));
        if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('apply-terminal-settings', settings);
        }
        return true;
    } catch (error) {
        console.error('Failed to save settings:', error);
        return false;
    }
}

// IPC handlers for settings
ipcMain.handle('get-settings', async () => {
    return await loadSettings();
});

ipcMain.handle('save-settings', async (event, settings) => {
    return await saveSettings(settings);
});

ipcMain.handle('open-directory-dialog', async () => {
    const result = await dialog.showOpenDialog({
        properties: ['openDirectory']
    });
    return result.canceled ? 'canceled' : result.filePaths[0];
});

// Handle settings updates
ipcMain.on('settings-updated', async (event, settings) => {
    try {
        // Apply settings to terminal
        if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('apply-terminal-settings', settings);
        }
    } catch (error) {
        console.error('Error applying settings:', error);
    }
});

// Keep track of settings window
let settingsWindow = null;

ipcMain.on('open-settings-window', () => {
    if (settingsWindow) {
        // If window exists, hide it first then close it
        settingsWindow.hide();
        settingsWindow.close();
        settingsWindow = null;
        return;
    }

    // Get main window bounds to center settings window
    const mainBounds = mainWindow.getBounds();
    const settingsWidth = 500;
    const settingsHeight = 600;

    // Calculate center position relative to main window
    const x = Math.round(mainBounds.x + (mainBounds.width - settingsWidth) / 2);
    const y = Math.round(mainBounds.y + (mainBounds.height - settingsHeight) / 2);

    // Create new settings window
    settingsWindow = new BrowserWindow({
        width: settingsWidth,
        height: settingsHeight,
        x: x,
        y: y,
        title: 'Settings',
        frame: false,
        transparent: false,
        resizable: false,
        backgroundColor: '#1e1e1e',
        parent: mainWindow,
        modal: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true
        },
        show: false
    });

    // Enable remote module
    require('@electron/remote/main').enable(settingsWindow.webContents);
    
    settingsWindow.loadFile('settings.html');
    settingsWindow.setMenu(null);

    // Show window when ready
    settingsWindow.once('ready-to-show', () => {
        settingsWindow.show();
    });

    // Handle close button click
    ipcMain.once('close-settings-window', () => {
        if (settingsWindow) {
            settingsWindow.hide();
            settingsWindow.close();
            settingsWindow = null;
        }
    });

    // Handle window close
    settingsWindow.on('closed', () => {
        settingsWindow = null;
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
