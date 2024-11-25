const { ipcRenderer } = require('electron');
const os = require('os');
const path = require('path');
const fs = require('fs').promises;

// Terminal state
let commandHistory = [];
let historyPosition = -1;
let currentDirectory = os.homedir();
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
let commandAliases = {
    'll': 'dir',
    'ls': 'dir',
    'clear': 'cls',
    '..': 'cd ..',
    '...': 'cd ../..',
    'home': `cd ${os.homedir()}`,
    'desktop': `cd ${path.join(os.homedir(), 'Desktop')}`,
    'downloads': `cd ${path.join(os.homedir(), 'Downloads')}`,
    'documents': `cd ${path.join(os.homedir(), 'Documents')}`,
};

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
    saveCommandHistory();
}

// Load aliases from file
async function loadAliases() {
    try {
        const data = await fs.readFile(ALIASES_FILE, 'utf8');
        const loadedAliases = JSON.parse(data);
        commandAliases = { ...commandAliases, ...loadedAliases };
    } catch (error) {
        // File doesn't exist yet, that's okay
    }
}

// Save aliases to file
async function saveAliases() {
    try {
        await fs.writeFile(ALIASES_FILE, JSON.stringify(commandAliases, null, 2));
    } catch (error) {
        console.error('Failed to save aliases:', error);
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
    // Add newline before each command
    appendToTerminal('\n');
    
    const fullPrompt = `${os.userInfo().username}@${os.hostname()}:${currentDirectory}$ ${command}\n`;
    appendToTerminal(fullPrompt);

    // Add to history before execution
    addToHistory(command);

    // Handle built-in commands first
    if (await handleBuiltInCommands(command)) {
        // Add newline after built-in commands
        appendToTerminal('\n');
        return;
    }

    // Check for aliases and expand them
    const args = command.split(' ');
    const cmd = args[0].toLowerCase();
    if (commandAliases[cmd]) {
        const aliasedCmd = commandAliases[cmd];
        // Handle additional arguments if any
        const additionalArgs = args.slice(1);
        command = additionalArgs.length > 0 
            ? `${aliasedCmd} ${additionalArgs.join(' ')}` 
            : aliasedCmd;
        appendToTerminal(`Expanding alias: ${command}\n`);
    }
    
    try {
        const result = await ipcRenderer.invoke('run-terminal-command', command);
        if (result.success) {
            if (result.output) {
                appendToTerminal(result.output);
                // Add newline if output doesn't end with one
                if (!result.output.endsWith('\n')) {
                    appendToTerminal('\n');
                }
            }
            // Update current directory if it was a CD command
            if (command.toLowerCase().startsWith('cd ')) {
                currentDirectory = await ipcRenderer.invoke('get-current-directory');
                updatePrompt();
            }
        } else {
            appendToTerminal(result.error, true);
            // Add newline if error doesn't end with one
            if (!result.error.endsWith('\n')) {
                appendToTerminal('\n');
            }
        }
        
        // Update history list
        updateHistoryList();
    } catch (error) {
        appendToTerminal(`Error: ${error.message}\n`, true);
    }
}

// Handle built-in commands
async function handleBuiltInCommands(command) {
    const args = command.split(' ');
    const cmd = args[0].toLowerCase();

    switch(cmd) {
        case 'alias':
            if (args[1] === 'list') {
                appendToTerminal('\nAvailable aliases:\n');
                Object.entries(commandAliases).forEach(([alias, cmd]) => {
                    appendToTerminal(`${alias} -> ${cmd}\n`);
                });
                return true;
            } else if (args[1] === 'add' && args[2]) {
                const [name, ...value] = args[2].split('=');
                if (name && value.length) {
                    commandAliases[name] = value.join('=');
                    await saveAliases();
                    appendToTerminal(`Alias '${name}' created\n`);
                } else {
                    appendToTerminal('Usage: alias add name=command\n', true);
                }
                return true;
            }
            break;

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
document.getElementById('settingsBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    // TODO: Implement settings functionality
    console.log('Settings clicked');
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
            searchMode = false;
            if (matchedCommands.length > 0) {
                terminalInput.value = matchedCommands[matchIndex];
            }
            appendToTerminal('\n');
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
        
        if (command) {
            await executeCommand(command);
            terminalInput.value = '';
        }
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
