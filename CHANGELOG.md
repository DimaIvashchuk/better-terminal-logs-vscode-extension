# Changelog

All notable changes to the "Better Terminal Logs" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.1] - 2024-11-09

### 🎉 Initial Release

#### Added
- **Automatic Terminal Capture** - Captures output from all VS Code terminals automatically
- **Multi-Terminal Support** - Tabbed interface to switch between multiple terminals
- **CloudWatch-Style UI** - Collapsible log entries with timestamp and preview
- **Smart Log Detection**:
  - Commands (green with `$` prefix)
  - Errors (red with `✗` prefix) - 15+ error patterns
  - Warnings (orange with `⚠` prefix) - 5+ warning patterns
  - Normal output (default styling)
- **Advanced Filtering**:
  - Real-time search across all logs
  - Type-based filtering (All / Errors / Warnings / Normal / Commands)
  - Combined search + filter support
- **Keyboard Shortcut** - `cmd+shift+l` (Mac) or `ctrl+shift+l` (Windows/Linux)
- **Historical Log Replay** - View logs even if panel opened after commands executed
- **Clean Output Processing**:
  - ANSI escape code removal
  - Shell integration sequence filtering
  - Zsh prompt artifact removal (`%`)
  - Carriage return handling
- **Activation Notification** - Shows when extension is ready
- **Clear Function** - Clear logs for current terminal
- **Auto-scroll** - Automatically scrolls to newest logs

#### Technical Details
- Uses VS Code Shell Integration API (`onDidStartTerminalShellExecution`)
- Terminal registration via `onDidOpenTerminal`
- Webview panel with HTML/CSS/JavaScript
- TypeScript-based extension
- VS Code theme color integration
- Structured log storage in memory

#### Known Issues
- npm scripts started from VS Code UI (hover + click) may not capture properly
  - **Workaround**: Run npm scripts manually in terminal
  - **Reason**: These terminals don't have shell integration enabled
- Shell Integration API required (VS Code 1.93+)
- Logs stored in memory only (cleared on VS Code restart)

### Patterns Detected

#### Error Patterns
- `error`, `failed`, `failure`, `exception`, `fatal`
- `cannot`, `unable to`, `not found`, `invalid`
- `denied`, `refused`
- `exit code [1-9]`
- Stack traces (lines starting with `at`)
- `[ERROR]`, `ERR!`
- Symbols: `✗`, `❌`, `⨯`

#### Warning Patterns
- `warn`, `warning`, `caution`
- `deprecated`
- `[WARN]`
- Symbol: `⚠`

### Requirements
- VS Code version: `^1.93.0`
- Shell integration enabled (default in VS Code 1.93+)
- Supported shells: bash, zsh, fish, pwsh

---

## Development Notes

### Version 0.0.1 Development Highlights

**Architecture Decisions:**
1. Chose Shell Integration API over deprecated `onDidWriteTerminalData`
2. CloudWatch-style UI for familiar UX
3. In-memory storage for performance
4. Separate HTML file for webview maintainability

**Challenges Solved:**
1. Race condition between terminal registration and command execution
2. ANSI escape code cleanup (15+ sequence types)
3. Zsh prompt artifacts (`%` character)
4. Empty log line filtering
5. Historical log replay on panel open
6. Search + filter combination logic

**Performance Considerations:**
- Logs stored per terminal (isolated)
- Filtering happens client-side (webview)
- Efficient regex patterns for log detection
- Lazy initialization for terminals

---

## Links

- [GitHub Repository](https://github.com/DimaIvashchuk/better-terminal-logs-vscode-extension)
- [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=your-publisher.better-terminal-logs) *(coming soon)*
- [Report Issues](https://github.com/DimaIvashchuk/better-terminal-logs-vscode-extension/issues)

---

*Made with ❤️ for developers who love clean terminals*
