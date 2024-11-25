const { ipcRenderer } = require('electron');
const remote = require('@electron/remote');
const settingsWindow = remote.getCurrentWindow();
const { dialog } = remote;
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

// Get all form elements
const defaultDirectoryInput = document.getElementById('default-directory');
const fontSizeInput = document.getElementById('font-size');
const fontFamilySelect = document.getElementById('font-family');
const backgroundColorInput = document.getElementById('terminal-bg-color');
const textColorInput = document.getElementById('terminal-text-color');
const clearOnCloseCheckbox = document.getElementById('clear-on-close');
const saveHistoryCheckbox = document.getElementById('save-history');
const historySizeInput = document.getElementById('history-size');

// Load current settings
async function loadSettings() {
    try {
        const settings = await ipcRenderer.invoke('get-settings');
        if (settings) {
            defaultDirectoryInput.value = settings.defaultDirectory || '';
            fontSizeInput.value = settings.fontSize || 14;
            fontFamilySelect.value = settings.fontFamily || 'Consolas';
            backgroundColorInput.value = settings.backgroundColor || '#000000';
            textColorInput.value = settings.textColor || '#ffffff';
            clearOnCloseCheckbox.checked = settings.clearOnClose || false;
            saveHistoryCheckbox.checked = settings.saveHistory || false;
            historySizeInput.value = settings.historySize || 1000;
        }
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

// Save settings
async function saveSettings() {
    const settings = {
        defaultDirectory: defaultDirectoryInput.value,
        fontSize: parseInt(fontSizeInput.value),
        fontFamily: fontFamilySelect.value,
        backgroundColor: backgroundColorInput.value,
        textColor: textColorInput.value,
        clearOnClose: clearOnCloseCheckbox.checked,
        saveHistory: saveHistoryCheckbox.checked,
        historySize: parseInt(historySizeInput.value)
    };

    try {
        await ipcRenderer.invoke('save-settings', settings);
    } catch (error) {
        console.error('Error saving settings:', error);
    }
}

// Add event listeners for all inputs
[fontSizeInput, fontFamilySelect, backgroundColorInput, textColorInput, 
 clearOnCloseCheckbox, saveHistoryCheckbox, historySizeInput].forEach(input => {
    input.addEventListener('change', saveSettings);
});

// Browse button handler
document.getElementById('browse-directory').addEventListener('click', async () => {
    const result = await ipcRenderer.invoke('open-directory-dialog');
    if (result && result !== 'canceled') {
        defaultDirectoryInput.value = result;
        saveSettings();
    }
});

// Initialize settings when window loads
window.addEventListener('load', loadSettings);

// Event Listeners
document.getElementById('minimize-settings-button').addEventListener('click', () => {
    settingsWindow.minimize();
});

document.getElementById('close-settings-button').addEventListener('click', async () => {
    await saveSettings();
    settingsWindow.hide();
    ipcRenderer.send('close-settings-window');
});

// Debug logging
console.log('Settings window loaded');
