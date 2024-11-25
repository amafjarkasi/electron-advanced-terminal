console.log('Script loaded'); // Verify script loading

const { ipcRenderer } = require('electron');
const remote = require('@electron/remote');
const os = require('os');
const path = require('path');
const fs = require('fs').promises;

// Constants for terminal settings
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
        const settings = await ipcRenderer.invoke('get-settings');
        applySettings(settings);
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

// Apply settings to terminal
function applySettings(settings) {
    if (!settings) return;

    // Apply terminal settings
    if (settings.defaultDirectory) {
        currentDirectory = settings.defaultDirectory;
        updatePrompt();
    }

    if (settings.fontSize) {
        terminalOutput.style.fontSize = `${settings.fontSize}px`;
    }

    if (settings.fontFamily) {
        terminalOutput.style.fontFamily = settings.fontFamily;
    }

    if (settings.backgroundColor) {
        terminalOutput.style.backgroundColor = settings.backgroundColor;
    }

    if (settings.textColor) {
        terminalOutput.style.color = settings.textColor;
    }

    // Apply behavior settings
    clearOnClose = settings.clearOnClose || false;
    shouldSaveHistory = settings.saveHistory || true;
}

// Terminal state
let commandHistory = [];
let historyPosition = -1;
let currentDirectory = os.homedir();
let shouldSaveHistory = true; // Default to true
let searchMode = false;
let searchBuffer = '';
let matchedCommands = [];
let matchIndex = 0;

// Configuration
const MAX_HISTORY = 1000;
const CONFIG_DIR = path.join(os.homedir(), '.terminal_config');
const HISTORY_FILE = path.join(CONFIG_DIR, 'command_history.json');

// Productivity features
const ALIASES_FILE = path.join(os.homedir(), '.terminal_aliases');

// Default aliases
const commandAliases = {
    'll': 'dir',
    'ls': 'dir',
    'clear': 'cls',
    '..': 'cd ..',
    '...': 'cd ../..',
    'home': `cd "${os.homedir()}"`,
    'desktop': `cd "${path.join(os.homedir(), 'Desktop')}"`,
    'downloads': `cd "${path.join(os.homedir(), 'Downloads')}"`,
    'documents': `cd "${path.join(os.homedir(), 'Documents')}"`,
};

// Load aliases from file
async function loadAliases() {
    try {
        const data = await fs.readFile(ALIASES_FILE, 'utf8');
        const loadedAliases = JSON.parse(data);
        Object.assign(commandAliases, loadedAliases);
        console.log('Loaded aliases:', Object.keys(commandAliases).length);
    } catch (error) {
        console.log('No previous aliases found');
    }
}

// Save aliases to file
async function saveAliases() {
    try {
        await fs.mkdir(path.dirname(ALIASES_FILE), { recursive: true });
        await fs.writeFile(ALIASES_FILE, JSON.stringify(commandAliases, null, 2));
        console.log('Saved aliases:', Object.keys(commandAliases).length);
    } catch (error) {
        console.error('Failed to save aliases:', error);
    }
}

// Directory bookmarks
let directoryBookmarks = new Map();

// DOM Elements
const terminalOutput = document.getElementById('terminalOutput');
const terminalInput = document.getElementById('terminalInput');
const clearTerminalBtn = document.getElementById('clearTerminal');
const historyButton = document.getElementById('historyButton');
const historyPopup = document.getElementById('historyPopup');
const historyList = document.getElementById('historyList');
const minimizeButton = document.getElementById('minimize-button');
const maximizeButton = document.getElementById('maximize-button');
const closeButton = document.getElementById('close-button');
const quickCommandsBtn = document.getElementById('quickCommandsBtn');
const settingsBtn = document.getElementById('settingsBtn');

// Ensure config directory exists
async function ensureConfigDir() {
    try {
        await fs.access(CONFIG_DIR);
    } catch {
        await fs.mkdir(CONFIG_DIR, { recursive: true });
    }
}

// Load command history
async function loadCommandHistory() {
    try {
        await ensureConfigDir();
        const data = await fs.readFile(HISTORY_FILE, 'utf8');
        commandHistory = JSON.parse(data);
        historyPosition = commandHistory.length;
        console.log('Loaded command history:', commandHistory.length, 'commands');
    } catch (error) {
        console.log('No previous command history found');
        commandHistory = [];
    }
}

// Save command history
async function saveCommandHistory() {
    try {
        await ensureConfigDir();
        await fs.writeFile(HISTORY_FILE, JSON.stringify(commandHistory, null, 2));
        console.log('Saved command history:', commandHistory.length, 'commands');
    } catch (error) {
        console.error('Failed to save command history:', error);
    }
}

// Add command to history
function addToHistory(command) {
    // Don't add empty commands or duplicates of the last command
    if (!command.trim() || (commandHistory.length > 0 && commandHistory[commandHistory.length - 1] === command)) {
        return;
    }

    commandHistory.push(command);
    
    // Keep history within size limit
    if (commandHistory.length > MAX_HISTORY) {
        commandHistory = commandHistory.slice(-MAX_HISTORY);
    }
    
    historyPosition = commandHistory.length;
    if (shouldSaveHistory) {
        saveCommandHistory();
    }
}

// Update terminal prompt
function updatePrompt() {
    const username = os.userInfo().username;
    const hostname = os.hostname();
    const promptInfo = document.querySelector('.prompt-info');
    
    promptInfo.querySelector('.username').textContent = username;
    promptInfo.querySelector('.hostname').textContent = hostname;
    promptInfo.querySelector('.path').textContent = currentDirectory;
}

// Terminal output handling
function appendToTerminal(text, isError = false) {
    const span = document.createElement('span');
    if (isError) {
        span.classList.add('error');
    }
    
    // Ensure proper line endings
    const formattedText = text.replace(/\r\n/g, '\n');
    span.textContent = formattedText;
    
    terminalOutput.appendChild(span);
    terminalOutput.scrollTop = terminalOutput.scrollHeight;
}

// Command execution
async function executeCommand(command) {
    try {
        // Trim the command and skip if empty
        command = command.trim();
        if (!command) return;

        // Check for aliases first
        const parts = command.split(/\s+/);
        const firstWord = parts[0].toLowerCase();
        if (commandAliases[firstWord]) {
            const aliasCommand = commandAliases[firstWord];
            command = aliasCommand + (parts.length > 1 ? ' ' + parts.slice(1).join(' ') : '');
            appendToTerminal(`> ${command}\n`);
        }

        // Handle built-in commands
        const isBuiltIn = await handleBuiltInCommands(command);
        if (isBuiltIn) {
            addToHistory(command);
            updateHistoryList();
            return;
        }

        // Execute external command
        const result = await ipcRenderer.invoke('run-terminal-command', command);

        if (result.success) {
            if (result.output && result.output.trim()) {
                appendToTerminal(result.output);
                if (!result.output.endsWith('\n')) {
                    appendToTerminal('\n');
                }
            }
            // Update current directory if it was a CD command
            if (command.toLowerCase().startsWith('cd ')) {
                currentDirectory = await ipcRenderer.invoke('get-current-directory');
                updatePrompt();
                appendToTerminal(`Directory changed to: ${currentDirectory}\n`);
            }
        } else {
            appendToTerminal(result.error || 'Command failed', true);
            appendToTerminal('\n');
        }
        
        // Add to history
        addToHistory(command);
        updateHistoryList();
    } catch (error) {
        appendToTerminal(`Error: ${error.message}\n`, true);
    }
}

// Handle built-in commands
async function handleBuiltInCommands(command) {
    const args = command.trim().split(/\s+/);
    const cmd = args[0].toLowerCase();

    switch(cmd) {
        case '..':
            try {
                await ipcRenderer.invoke('run-terminal-command', 'cd ..');
                currentDirectory = await ipcRenderer.invoke('get-current-directory');
                updatePrompt();
                appendToTerminal(`Directory changed to: ${currentDirectory}\n`);
                return true;
            } catch (error) {
                appendToTerminal(`Failed to change directory: ${error.message}\n`, true);
                return true;
            }

        case '...':
            try {
                await ipcRenderer.invoke('run-terminal-command', 'cd ../..');
                currentDirectory = await ipcRenderer.invoke('get-current-directory');
                updatePrompt();
                appendToTerminal(`Directory changed to: ${currentDirectory}\n`);
                return true;
            } catch (error) {
                appendToTerminal(`Failed to change directory: ${error.message}\n`, true);
                return true;
            }

        case 'home':
            try {
                const homeDir = os.homedir();
                await ipcRenderer.invoke('run-terminal-command', `cd "${homeDir}"`);
                currentDirectory = await ipcRenderer.invoke('get-current-directory');
                updatePrompt();
                appendToTerminal(`Directory changed to: ${currentDirectory}\n`);
                return true;
            } catch (error) {
                appendToTerminal(`Failed to change directory: ${error.message}\n`, true);
                return true;
            }

        case 'alias':
            if (args.length === 1 || args[1] === 'list') {
                appendToTerminal('\nAvailable aliases:\n');
                Object.entries(commandAliases).forEach(([alias, cmd]) => {
                    appendToTerminal(`${alias} -> ${cmd}\n`);
                });
                return true;
            } else if (args[1] === 'add' && args.length > 2) {
                // Join remaining arguments to handle equals signs and spaces
                const aliasString = args.slice(2).join(' ');
                const [name, ...value] = aliasString.split('=');
                if (name && value.length) {
                    const trimmedName = name.trim();
                    const trimmedValue = value.join('=').trim();
                    commandAliases[trimmedName] = trimmedValue;
                    await saveAliases();
                    appendToTerminal(`Alias '${trimmedName}' created -> ${trimmedValue}\n`);
                } else {
                    appendToTerminal('Usage: alias add name=command\n', true);
                }
                return true;
            } else if (args[1] === 'remove' && args[2]) {
                const name = args[2].trim();
                if (commandAliases[name]) {
                    delete commandAliases[name];
                    await saveAliases();
                    appendToTerminal(`Alias '${name}' removed\n`);
                } else {
                    appendToTerminal(`Alias '${name}' not found\n`, true);
                }
                return true;
            } else if (args[1] === 'help') {
                appendToTerminal('\nAlias Commands:\n');
                appendToTerminal('  alias list          - List all aliases\n');
                appendToTerminal('  alias add name=cmd  - Create new alias\n');
                appendToTerminal('  alias remove name   - Remove an alias\n');
                appendToTerminal('  alias help          - Show this help\n');
                return true;
            }
            appendToTerminal('Unknown alias command. Try "alias help" for usage.\n', true);
            return true;

        case 'bookmark':
            if (args[1] === 'add' && args[2]) {
                directoryBookmarks.set(args[2], currentDirectory);
                appendToTerminal(`Bookmark '${args[2]}' created for ${currentDirectory}\n`);
                return true;
            } else if (args[1] === 'list') {
                appendToTerminal('\nBookmarked directories:\n');
                directoryBookmarks.forEach((dir, name) => {
                    appendToTerminal(`${name} -> ${dir}\n`);
                });
                return true;
            } else if (args[1] === 'go' && args[2]) {
                const dir = directoryBookmarks.get(args[2]);
                if (dir) {
                    currentDirectory = dir;
                    updatePrompt();
                    appendToTerminal(`Changed directory to ${dir}\n`);
                } else {
                    appendToTerminal(`Bookmark '${args[2]}' not found\n`, true);
                }
                return true;
            }
            break;

        case 'history':
            if (args.length === 1) {
                appendToTerminal('\nCommand History:\n');
                commandHistory.forEach((cmd, index) => {
                    appendToTerminal(`${index + 1}: ${cmd}\n`);
                });
                return true;
            } else if (args[1] === 'clear') {
                commandHistory = [];
                historyPosition = 0;
                await saveCommandHistory();
                appendToTerminal('Command history cleared\n');
                return true;
            }
            break;

        case 'clear':
        case 'cls':
            terminalOutput.innerHTML = '';
            return true;
    }

    return false;
}

// Command history search
function searchHistory(searchTerm) {
    return commandHistory.filter(cmd => 
        cmd.toLowerCase().includes(searchTerm.toLowerCase())
    ).reverse();
}

// History popup handling
function updateHistoryList() {
    historyList.innerHTML = '';
    const recentCommands = [...new Set(commandHistory.slice(-10).reverse())];
    
    recentCommands.forEach(cmd => {
        const item = document.createElement('div');
        item.className = 'history-item';
        item.textContent = cmd;
        item.addEventListener('click', () => {
            terminalInput.value = cmd;
            terminalInput.focus();
            historyPopup.classList.remove('show');
        });
        historyList.appendChild(item);
    });
}

// Toggle history popup
historyButton.addEventListener('click', (e) => {
    e.stopPropagation();
    updateHistoryList();

    // Toggle visibility
    const isVisible = historyPopup.classList.contains('show');
    if (isVisible) {
        historyPopup.classList.remove('show');
        return;
    }

    // Show popup
    historyPopup.classList.add('show');

    // Get button position
    const buttonRect = historyButton.getBoundingClientRect();
    
    // Position popup above the button
    historyPopup.style.bottom = `${window.innerHeight - buttonRect.top}px`;
    historyPopup.style.left = `${buttonRect.left}px`;

    // Check if popup would go off screen to the right
    const popupRect = historyPopup.getBoundingClientRect();
    if (buttonRect.left + popupRect.width > window.innerWidth - 10) {
        // Align right edge of popup with right edge of button
        historyPopup.style.left = `${buttonRect.right - popupRect.width}px`;
    }
});

// Close history popup when clicking outside
document.addEventListener('click', (e) => {
    if (!historyPopup.contains(e.target) && e.target !== historyButton) {
        historyPopup.classList.remove('show');
    }
});

// Menu state management
let activeMenu = null;
let activeSubmenu = null;
let submenuTimeout = null;

function showQuickCommandsMenu(e) {
    e.stopPropagation();
    const isVisible = quickCommandsMenu.classList.contains('show');
    
    if (isVisible) {
        hideQuickCommandsMenu();
        return;
    }
    
    // Position the menu
    const buttonRect = quickCommandsBtn.getBoundingClientRect();
    quickCommandsMenu.style.bottom = `${window.innerHeight - buttonRect.top}px`;
    quickCommandsMenu.style.left = `${buttonRect.left}px`;
    
    // Check if menu would go off screen
    quickCommandsMenu.classList.add('show');
    const menuRect = quickCommandsMenu.getBoundingClientRect();
    
    if (buttonRect.left + menuRect.width > window.innerWidth - 10) {
        quickCommandsMenu.style.left = `${buttonRect.right - menuRect.width}px`;
    }
    
    activeMenu = quickCommandsMenu;
}

function hideQuickCommandsMenu() {
    quickCommandsMenu.classList.remove('show');
    hideSubmenu();
    activeMenu = null;
}

function showSubmenu(category, submenuContent) {
    clearTimeout(submenuTimeout);
    
    // Remove existing submenu
    hideSubmenu();
    
    const rect = category.getBoundingClientRect();
    const menuRect = quickCommandsMenu.getBoundingClientRect();
    
    // Create new submenu
    const submenu = document.createElement('div');
    submenu.className = 'submenu';
    submenu.innerHTML = submenuContent;
    document.body.appendChild(submenu);
    
    // Get dimensions after adding to DOM
    const submenuRect = submenu.getBoundingClientRect();
    
    // Calculate available space
    const spaceRight = window.innerWidth - menuRect.right - 10;
    const spaceLeft = menuRect.left - 10;
    
    // Position horizontally
    let left;
    if (spaceRight >= submenuRect.width) {
        left = menuRect.right + 5;
    } else if (spaceLeft >= submenuRect.width) {
        left = menuRect.left - submenuRect.width - 5;
    } else {
        left = spaceRight >= spaceLeft ? 
            window.innerWidth - submenuRect.width - 10 : 
            10;
    }
    
    // Position vertically
    let top = Math.min(
        Math.max(10, rect.top),
        window.innerHeight - submenuRect.height - 10
    );
    
    submenu.style.left = `${left}px`;
    submenu.style.top = `${top}px`;
    
    // Show submenu with animation
    requestAnimationFrame(() => {
        submenu.classList.add('show');
    });
    
    activeSubmenu = submenu;
    
    // Event handlers
    function handleMouseLeave(e) {
        const toElement = e.relatedTarget;
        if (!submenu.contains(toElement) && !category.contains(toElement)) {
            submenuTimeout = setTimeout(hideSubmenu, 100);
        }
    }
    
    category.addEventListener('mouseleave', handleMouseLeave);
    submenu.addEventListener('mouseleave', handleMouseLeave);
    submenu.addEventListener('mouseenter', () => {
        clearTimeout(submenuTimeout);
    });
}

function hideSubmenu() {
    if (activeSubmenu) {
        activeSubmenu.remove();
        activeSubmenu = null;
    }
}

// Event Listeners
quickCommandsBtn.addEventListener('click', showQuickCommandsMenu);

document.addEventListener('click', (e) => {
    if (activeMenu && !activeMenu.contains(e.target) && e.target !== quickCommandsBtn) {
        hideQuickCommandsMenu();
    }
});

// Handle menu item clicks
quickCommandsMenu.addEventListener('click', (e) => {
    const menuItem = e.target.closest('.menu-item');
    if (menuItem) {
        const command = menuItem.dataset.command;
        if (command) {
            terminalInput.value = command;
            hideQuickCommandsMenu();
            terminalInput.focus();
        }
    }
});

// Settings button click handler
document.getElementById('settingsBtn').addEventListener('click', function() {
    ipcRenderer.send('open-settings-window');
});

// Event Listeners
terminalInput.addEventListener('keydown', async (e) => {
    // Command history search (Ctrl+R)
    if (e.ctrlKey && e.key === 'r') {
        e.preventDefault();
        if (!searchMode) {
            searchMode = true;
            searchBuffer = '';
            appendToTerminal('\n(reverse-i-search)`\': ');
        }
        return;
    }

    if (searchMode) {
        if (e.key === 'Escape') {
            searchMode = false;
            searchBuffer = '';
            matchedCommands = [];
            matchIndex = 0;
            appendToTerminal('\n');
            updatePrompt();
            return;
        }

        if (e.key === 'Enter') {
            e.preventDefault();
            searchMode = false;
            if (matchedCommands.length > 0) {
                const command = matchedCommands[matchIndex];
                terminalInput.value = '';
                appendToTerminal(`\n${os.userInfo().username}@${os.hostname()}:${currentDirectory}$ ${command}\n`);
                await executeCommand(command);
                updatePrompt();
            }
            return;
        }

        if (e.key === 'Backspace') {
            searchBuffer = searchBuffer.slice(0, -1);
        } else if (e.key.length === 1) {
            searchBuffer += e.key;
        }

        matchedCommands = searchHistory(searchBuffer);
        if (matchedCommands.length > 0) {
            terminalInput.value = matchedCommands[0];
        }
        return;
    }

    // Normal command handling
    if (e.key === 'Enter') {
        e.preventDefault();
        const command = terminalInput.value.trim();
        terminalInput.value = '';
        
        if (command) {
            appendToTerminal(`\n${os.userInfo().username}@${os.hostname()}:${currentDirectory}$ ${command}\n`);
            await executeCommand(command);
        } else {
            appendToTerminal('\n');
        }
        updatePrompt();
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (historyPosition > 0) {
            historyPosition--;
            terminalInput.value = commandHistory[historyPosition];
        }
    } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (historyPosition < commandHistory.length - 1) {
            historyPosition++;
            terminalInput.value = commandHistory[historyPosition];
        } else {
            historyPosition = commandHistory.length;
            terminalInput.value = '';
        }
    }
});

// Window control buttons
minimizeButton.addEventListener('click', () => {
    ipcRenderer.send('window-minimize');
});

maximizeButton.addEventListener('click', () => {
    ipcRenderer.send('window-maximize');
    const icon = maximizeButton.querySelector('i');
    if (icon.classList.contains('fa-window-maximize')) {
        icon.classList.replace('fa-window-maximize', 'fa-window-restore');
    } else {
        icon.classList.replace('fa-window-restore', 'fa-window-maximize');
    }
});

closeButton.addEventListener('click', () => {
    ipcRenderer.send('window-close');
});

// Clear terminal
clearTerminalBtn.addEventListener('click', () => {
    terminalOutput.innerHTML = '';
    appendToTerminal('Welcome to Advanced Terminal\n');
    appendToTerminal(`Current directory: ${currentDirectory}\n\n`);
});

// Keep focus on input
document.addEventListener('click', () => {
    terminalInput.focus();
});

// Initialize
async function initializeTerminal() {
    await loadCommandHistory();
    await loadAliases();
    updatePrompt();
    terminalInput.focus();
    appendToTerminal('Welcome to Advanced Terminal\n');
    appendToTerminal('Productivity Features:\n');
    appendToTerminal('- Use "alias list" to see all aliases\n');
    appendToTerminal('- Use "alias add name=command" to create new alias\n');
    appendToTerminal('- Use "bookmark add name" to bookmark current directory\n');
    appendToTerminal('- Use "bookmark list" to see all bookmarks\n');
    appendToTerminal('- Use "bookmark go name" to navigate to bookmark\n');
    appendToTerminal('- Use "history" to see full command history\n');
    appendToTerminal(`Current directory: ${currentDirectory}\n\n`);
}

initializeTerminal();

// Listen for settings updates
ipcRenderer.on('apply-terminal-settings', (event, settings) => {
    applySettings(settings);
});

// Initialize settings when window loads
window.addEventListener('load', loadAndApplySettings);

// Listen for directory requests
ipcRenderer.on('get-current-directory', () => {
    ipcRenderer.send('current-directory-response', currentDirectory);
});

// Update current directory display
