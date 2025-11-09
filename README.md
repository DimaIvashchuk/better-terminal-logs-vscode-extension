# Better Terminal Logs

A VS Code extension that captures terminal output and displays it in a beautiful, collapsible webview panel with real-time updates.

## Features

- **Live Terminal Monitoring**: Captures stdout and stderr from your active VS Code terminal in real-time
- **Collapsible Log Entries**: Each log appears as an expandable block for easy navigation
- **Smart Log Detection**: Automatically categorizes logs as INFO, WARN, or ERROR
- **Color-Coded Display**: Visual indicators for different log types (blue for info, orange for warnings, red for errors)
- **Modern UI**: Clean interface using VS Code theme colors for seamless integration
- **Real-time Updates**: Logs stream live as they're generated
- **Clear Function**: Quickly clear all logs with one click

## Installation & Setup

### Development

1. Clone this repository
2. Open in VS Code
3. Run `npm install` to install dependencies
4. Press `F5` to open a new Extension Development Host window

### Usage

1. Open the Command Palette (`Cmd+Shift+P` on macOS or `Ctrl+Shift+P` on Windows/Linux)
2. Type and select: **"Better Terminal Logs: Show Collapsible Logs"**
3. A new webview panel will open on the right side
4. Click "Spawn Terminal" in the prompt, or manually run: **"Better Terminal Logs: Spawn Terminal"**
5. A new terminal named "Better Terminal" will be created
6. All commands you run in this terminal will be captured and logged in the Collapsible Logs panel

## How It Works

The extension uses a custom Pseudoterminal (PTY) implementation to:
- Create a fully functional terminal with a custom PTY interface
- Capture both stdout and stderr from the shell process
- Parse and categorize log messages automatically (INFO/WARN/ERROR)
- Stream logs to a custom webview in real-time
- Display logs with collapsible `<details>` elements for multi-line content

This approach gives us complete control over terminal I/O without depending on deprecated APIs.

## Commands

- `better-terminal-logs.showCollapsibleLogs` - Opens the Collapsible Logs panel
- `better-terminal-logs.spawnTerminal` - Creates a new captured terminal named "Better Terminal"

## Log Type Detection

The extension automatically detects log types based on content:
- **ERROR**: Contains "error", "✗", "failed"
- **WARN**: Contains "warn", "warning", "⚠"
- **INFO**: Everything else

## Technology Stack

- **TypeScript**: Extension logic
- **VS Code Extension API**: Pseudoterminal (PTY) and webview
- **Node.js child_process**: Shell process spawning
- **HTML/CSS/JavaScript**: Webview UI (separate file: `src/webview/index.html`)
- **VS Code Theme Variables**: Native theming support

## Building

```bash
npm run compile
```

## Running Tests

```bash
npm test
```

## Publishing

Before publishing, update the `publisher` field in `package.json` with your VS Code Marketplace publisher ID.

```bash
npm run vscode:prepublish
vsce package
vsce publish
```

## Known Issues

- ANSI color codes in terminal output are not yet parsed (displayed as raw text)
- Only one "Better Terminal" can be active at a time
- Terminal requires shell to be properly configured in the environment

## Future Enhancements

- [ ] ANSI color code parsing
- [ ] Log filtering by type
- [ ] Export logs to file
- [ ] Search functionality
- [ ] Custom log patterns
- [ ] Log file watching mode
- [ ] Terminal selection (choose which terminal to monitor)

## Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

## License

MIT

---

**Enjoy cleaner, more organized terminal logs!** 🚀
