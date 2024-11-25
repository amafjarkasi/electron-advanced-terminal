const { ipcRenderer } = require('electron');
const os = require('os');
const path = require('path');
const fs = require('fs').promises;

// Constants
const CONFIG_FILE = path.join(os.homedir(), '.terminal_config', 'settings.json');
const DEFAULT_SETTINGS = {
    defaultDirectory: os.homedir(),
    fontSize: 14,
    fontFamily: 'Consolas',
    backgroundColor: '#1e1e1e',
    textColor: '#ffffff',
    clearOnClose: false,
    saveHistory: true,
    historySize: 1000
};

// Load and apply settings
async function loadAndApplySettings() {
    try {
        const data = await fs.readFile(CONFIG_FILE, 'utf8');
        const settings = { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
        applySettings(settings);
    } catch (error) {
        console.log('Using default settings');
        applySettings(DEFAULT_SETTINGS);
    }
}

// Apply settings to terminal
function applySettings(settings) {
    const terminal = document.querySelector('.terminal');
    if (!terminal) return;

    // Apply font settings
    terminal.style.fontSize = `${settings.fontSize}px`;
    terminal.style.fontFamily = settings.fontFamily;

    // Apply colors
    terminal.style.backgroundColor = settings.backgroundColor;
    terminal.style.color = settings.textColor;

    // Set working directory
    if (settings.defaultDirectory) {
        ipcRenderer.send('set-working-directory', settings.defaultDirectory);
    }

    // Apply history settings
    if (!settings.saveHistory) {
        // Clear history if saving is disabled
        terminal.innerHTML = '';
    }
}

// Listen for settings updates
ipcRenderer.on('apply-terminal-settings', (event, settings) => {
    applySettings(settings);
});

// Initialize settings when window loads
window.addEventListener('load', loadAndApplySettings);
