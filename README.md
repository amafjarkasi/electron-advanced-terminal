# Advanced Terminal

A modern, feature-rich terminal application built with Electron, designed to enhance developer productivity with an intuitive interface and powerful features.

## Features

- 🚀 Modern UI with smooth animations and transitions
- 📝 Command history with search functionality
- ⚡ Quick commands menu with customizable categories
- 🎨 Clean, minimal design with proper spacing and readability
- 🌙 Dark mode optimized interface
- 💾 Persistent command history and settings
- ⌨️ Keyboard shortcuts for common actions
- 📋 Copy/paste support with proper formatting
- 🔍 Search through command history
- 📁 Advanced file system navigation with built-in commands
- 🎯 Smart command suggestions
- ⚙️ Customizable settings with persistent storage
- 🔄 Command aliases support
- 📌 Directory bookmarks

## Built-in Commands

### Navigation Commands
- `..` - Move up one directory
- `...` - Move up two directories
- `home` - Go to user's home directory

### Alias Commands
- `alias list` - Show all defined aliases
- `alias add [name] [command]` - Add a new alias
- `alias remove [name]` - Remove an existing alias

### Default Aliases
- `ll` or `ls` -> `dir`
- `clear` -> `cls`
- `desktop` -> `cd [Desktop path]`
- `downloads` -> `cd [Downloads path]`
- `documents` -> `cd [Documents path]`

## Installation

1. Clone the repository
```bash
git clone https://github.com/yourusername/electron-advanced-terminal.git
```

2. Install dependencies
```bash
cd electron-advanced-terminal
npm install
```

3. Run the application
```bash
npm start
```

## Usage

### Quick Commands Menu
- Access frequently used commands through categorized menus
- Hover over categories to view submenus
- Click any command to execute it instantly

### Command History
- Use Up/Down arrows to cycle through previous commands
- Click the history button to view full command history
- Search through history with real-time filtering
- History is automatically saved and persists between sessions

### Keyboard Shortcuts
- `Up/Down Arrow`: Navigate command history
- `Ctrl+L`: Clear terminal
- `Ctrl+C`: Copy selected text
- `Ctrl+V`: Paste text
- `Esc`: Close active menus

### Settings
- Font size and family customization
- Background and text color options
- Clear on close option
- Command history size limit
- Default directory configuration

## Development

### Building from Source

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build
```

### Project Structure
```
electron-advanced-terminal/
├── main.js           # Main Electron process
├── renderer.js       # Renderer process and UI logic
├── index.html        # Main application window
├── styles.css        # Application styling
├── settings.html     # Settings window
└── package.json      # Project dependencies and scripts
```

### Configuration Files
The application stores its configuration in the following locations:
- Settings: `~/.terminal_config/settings.json`
- Window State: `~/.terminal_config/window-state.json`
- Command History: `~/.terminal_config/command_history.json`
- Aliases: `~/.terminal_aliases`

## Contributing

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

Distributed under the MIT License. See `LICENSE` for more information.

## Contact

Your GitHub Profile - [@yourusername](https://github.com/yourusername)

Project Link: [https://github.com/yourusername/electron-advanced-terminal](https://github.com/yourusername/electron-advanced-terminal)