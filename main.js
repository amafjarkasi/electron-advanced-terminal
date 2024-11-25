const electron = require('electron');
const { app, BrowserWindow, ipcMain, Menu } = electron;
const path = require('path');
const fs = require('fs').promises;
const axios = require('axios');
const simpleGit = require('simple-git');
const si = require('systeminformation');
const os = require('os');

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
    
    // Check if --dev-tools flag is present
    if (process.argv.includes('--dev-tools')) {
        mainWindow.webContents.openDevTools();
    }

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
        // Handle CD commands specially to track directory changes
        const cdMatch = command.match(/^cd\s+(.+)/i);
        if (cdMatch) {
            let newPath = cdMatch[1].trim();
            
            // Handle home directory shortcut
            newPath = newPath.replace(/^~/, os.homedir());
            
            // Resolve the path
            let targetPath = path.isAbsolute(newPath) 
                ? newPath 
                : path.resolve(currentDirectory, newPath);

            // Remove any quotes that might have been added
            targetPath = targetPath.replace(/['"]/g, '');

            try {
                // Verify the path exists and is accessible
                await require('fs').promises.access(targetPath);
                currentDirectory = targetPath;
                return {
                    success: true,
                    output: ''
                };
            } catch (error) {
                return {
                    success: false,
                    error: `The system cannot find the path specified: ${targetPath}\n`
                };
            }
        }

        // For all other commands
        return new Promise((resolve) => {
            const { exec } = require('child_process');
            exec(command, { 
                cwd: currentDirectory,
                windowsHide: true
            }, (error, stdout, stderr) => {
                if (error) {
                    resolve({
                        success: false,
                        error: stderr || error.message
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

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
