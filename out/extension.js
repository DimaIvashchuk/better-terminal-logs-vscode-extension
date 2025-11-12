"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
let logsPanel;
const terminalLogs = {};
const terminalNames = {};
function activate(context) {
    console.log('✓ Better Terminal Logs extension is now active!');
    // Show activation notification
    vscode.window.showInformationMessage('🔍 Better Terminal Logs is now active!');
    // Command: Show Better Logs
    const showLogsCommand = vscode.commands.registerCommand('better-terminal-logs.showBetterLogs', () => {
        if (logsPanel) {
            logsPanel.reveal(vscode.ViewColumn.Two);
        }
        else {
            createLogsPanel(context);
        }
    });
    // Subscribe to terminal creation events
    const terminalCreatedListener = vscode.window.onDidOpenTerminal(terminal => {
        registerTerminalForCapture(terminal);
    });
    // Register existing terminals
    vscode.window.terminals.forEach(terminal => {
        registerTerminalForCapture(terminal);
    });
    // Handle terminal close
    const terminalClosedListener = vscode.window.onDidCloseTerminal(terminal => {
        terminal.processId.then(terminalId => {
            if (terminalId) {
                const id = terminalId.toString();
                delete terminalLogs[id];
                delete terminalNames[id];
                // Notify webview to remove tab
                if (logsPanel) {
                    logsPanel.webview.postMessage({
                        command: 'removeTerminal',
                        terminalId: id
                    });
                }
            }
        });
    });
    // Use Shell Integration API to capture terminal output
    const shellExecutionListener = vscode.window.onDidStartTerminalShellExecution(async (event) => {
        const terminal = event.terminal;
        const execution = event.execution;
        const terminalId = await terminal.processId;
        if (!terminalId) {
            return;
        }
        const id = terminalId.toString();
        // Store and send the command that was executed
        const commandLine = execution.commandLine;
        if (commandLine && commandLine.value) {
            const logEntry = {
                date: new Date().toISOString(),
                data: commandLine.value,
                isCommand: true
            };
            // Store the log
            if (terminalLogs[id]) {
                terminalLogs[id].push(logEntry);
            }
            // Send to panel if it exists
            if (logsPanel) {
                console.log('Sending command to webview:', commandLine.value);
                logsPanel.webview.postMessage({
                    command: 'addLog',
                    terminalId: id,
                    log: logEntry
                });
            }
        }
        // Read the output stream
        const stream = execution.read();
        // Handle data from the stream asynchronously
        (async () => {
            for await (const data of stream) {
                // Clean the output to remove escape sequences
                const cleanedOutput = cleanTerminalOutput(data);
                // Check if there's actual non-empty content after cleaning
                // Split by lines and check if at least one line has content
                const hasContent = cleanedOutput.split('\n').some(line => line.trim().length > 0);
                if (!hasContent) {
                    continue;
                }
                // Store and send structured log (CloudWatch style)
                const logType = detectLogType(cleanedOutput);
                const logEntry = {
                    date: new Date().toISOString(),
                    data: cleanedOutput,
                    type: logType
                };
                // Store the log
                if (terminalLogs[id]) {
                    terminalLogs[id].push(logEntry);
                }
                // Send to panel if it exists
                if (logsPanel) {
                    console.log('Sending log to webview:', cleanedOutput.substring(0, 50));
                    logsPanel.webview.postMessage({
                        command: 'addLog',
                        terminalId: id,
                        log: logEntry
                    });
                }
            }
        })().catch(err => {
            console.error('Error reading terminal stream:', err);
        });
    });
    context.subscriptions.push(showLogsCommand, terminalCreatedListener, terminalClosedListener, shellExecutionListener);
}
function cleanTerminalOutput(data) {
    let cleaned = data;
    // Remove VS Code shell integration sequences (OSC 633)
    // Format: ESC ] 633 ; <letter> [; <params>] BEL
    cleaned = cleaned.replace(/\x1b\]633;[^\x07]*\x07/g, '');
    cleaned = cleaned.replace(/\x1b\]633;[^\x1b]*\x1b\\/g, ''); // Alternative terminator
    // Remove all OSC (Operating System Command) sequences
    // Format: ESC ] <number> ; <text> BEL or ESC ] <number> ; <text> ESC \
    cleaned = cleaned.replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '');
    // Remove all CSI (Control Sequence Introducer) sequences
    // This includes cursor movement, colors, and other formatting
    // Format: ESC [ <params> <letter>
    cleaned = cleaned.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '');
    // Remove character set sequences
    cleaned = cleaned.replace(/\x1b[\(\)][AB012]/g, '');
    // Remove other escape sequences
    cleaned = cleaned.replace(/\x1b[=>]/g, '');
    cleaned = cleaned.replace(/\x1b[78]/g, ''); // Save/restore cursor
    // Remove bell character
    cleaned = cleaned.replace(/\x07/g, '');
    // Remove carriage return followed by anything that's not a newline
    // This handles overwriting behavior in terminals
    cleaned = cleaned.replace(/\r(?!\n)/g, '');
    // Remove zsh prompt artifacts (lines that are just "%" or end with "%")
    // Split by lines, filter out problematic ones, rejoin
    const lines = cleaned.split('\n');
    const filteredLines = lines.filter(line => {
        const trimmed = line.trim();
        // Remove lines that are just "%" or just "%\r"
        if (trimmed === '%' || trimmed === '%\r') {
            return false;
        }
        return true;
    });
    cleaned = filteredLines.join('\n');
    // Clean up multiple consecutive newlines (keep max 2)
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    return cleaned;
}
function detectLogType(text) {
    const lowerText = text.toLowerCase();
    // Exclude patterns - these indicate the keyword is NOT an error/warning
    // (e.g., JSON properties, object keys, documentation)
    const excludePatterns = [
        /[{,]\s*["']?(error|warning|failed|failure|exception|warn)["\']?\s*:/i, // JSON properties: { error: 'value' }
        /:\s*["']?(error|warning|failed|failure|exception|warn)["']?\s*[,}]/i, // JSON values: { key: 'error' }
    ];
    // Check if this is likely a false positive (JSON object, etc.)
    for (const exclude of excludePatterns) {
        if (exclude.test(text)) {
            return 'normal';
        }
    }
    // High-priority error patterns (most specific, checked first)
    const highPriorityErrorPatterns = [
        /\[ERROR\]/i,
        /ERR!/i,
        /✗|❌|⨯/,
        /^(\s*)at\s+/m, // Stack traces
        /exit code [1-9]/i,
        /throw(s|n)?\s+(new\s+)?\w*error/i, // "throw Error", "throws Error"
        /uncaught\s+exception/i,
        /\bfatal\s+(error|exception)/i,
    ];
    // Medium-priority error patterns (need more context)
    const errorPatterns = [
        /^error:/i, // Lines starting with "Error:"
        /\berror\s*:/i, // "Error: something"
        /:\s*error\b/i, // "Something: error"
        /\bfailed\s+to\b/i, // "failed to do something"
        /\bfailure\b/i,
        /\bexception\b/i,
        /\bcannot\b/i,
        /\bunable to\b/i,
        /\bnot found\b/i,
        /\binvalid\b/i,
        /\bdenied\b/i,
        /\brefused\b/i,
    ];
    // Warning patterns
    const warningPatterns = [
        /\[WARN(ING)?\]/i,
        /⚠/,
        /^warning:/i, // Lines starting with "Warning:"
        /\bwarning\s*:/i, // "Warning: something"
        /\bwarn(ing)?\s+:/i,
        /\bdeprecated\b/i,
        /\bcaution\b/i,
    ];
    // Check high-priority errors first
    for (const pattern of highPriorityErrorPatterns) {
        if (pattern.test(text)) {
            return 'error';
        }
    }
    // Check for errors
    for (const pattern of errorPatterns) {
        if (pattern.test(text)) {
            return 'error';
        }
    }
    // Check for warnings
    for (const pattern of warningPatterns) {
        if (pattern.test(text)) {
            return 'warning';
        }
    }
    return 'normal';
}
async function registerTerminalForCapture(terminal) {
    try {
        // Wait for terminal to be ready
        const terminalId = await terminal.processId;
        if (!terminalId) {
            console.log('Terminal has no processId yet, retrying...');
            // Retry after a short delay
            setTimeout(() => registerTerminalForCapture(terminal), 500);
            return;
        }
        const id = terminalId.toString();
        // Check if already registered
        if (terminalLogs[id] !== undefined) {
            console.log('Terminal already registered:', id);
            return;
        }
        // Get terminal name with fallback
        const terminalName = terminal.name || `Terminal ${Object.keys(terminalLogs).length + 1}`;
        terminalLogs[id] = [];
        terminalNames[id] = terminalName;
        console.log('Registering terminal:', id, terminalName);
        // Notify webview about new terminal
        if (logsPanel) {
            console.log('Sending addTerminal message to webview');
            logsPanel.webview.postMessage({
                command: 'addTerminal',
                terminalId: id,
                terminalName: terminalName
            });
        }
    }
    catch (error) {
        console.error('Error registering terminal:', error);
    }
}
function createLogsPanel(context) {
    logsPanel = vscode.window.createWebviewPanel('collapsibleLogs', 'Better Terminal Logs', vscode.ViewColumn.Two, {
        enableScripts: true,
        retainContextWhenHidden: true
    });
    logsPanel.webview.html = getWebviewContent(context);
    // Send initial terminal list and replay all stored logs
    setTimeout(() => {
        if (logsPanel) {
            Object.keys(terminalLogs).forEach(terminalId => {
                logsPanel.webview.postMessage({
                    command: 'addTerminal',
                    terminalId: terminalId,
                    terminalName: terminalNames[terminalId]
                });
                // Replay all stored logs for this terminal
                if (terminalLogs[terminalId] && terminalLogs[terminalId].length > 0) {
                    console.log(`Replaying ${terminalLogs[terminalId].length} logs for terminal ${terminalId}`);
                    terminalLogs[terminalId].forEach(logEntry => {
                        logsPanel.webview.postMessage({
                            command: 'addLog',
                            terminalId: terminalId,
                            log: logEntry
                        });
                    });
                }
            });
        }
    }, 100);
    logsPanel.webview.onDidReceiveMessage(message => {
        switch (message.command) {
            case 'clear':
                // Clear specific terminal logs
                if (message.terminalId && terminalLogs[message.terminalId]) {
                    terminalLogs[message.terminalId] = [];
                }
                return;
        }
    }, undefined, context.subscriptions);
    logsPanel.onDidDispose(() => {
        logsPanel = undefined;
    }, null, context.subscriptions);
}
function getWebviewContent(context) {
    // Try production path first (out/webview/index.html)
    let htmlPath = path.join(context.extensionPath, 'out', 'webview', 'index.html');
    // Fall back to development path if production doesn't exist
    if (!fs.existsSync(htmlPath)) {
        htmlPath = path.join(context.extensionPath, 'src', 'webview', 'index.html');
    }
    try {
        const htmlContent = fs.readFileSync(htmlPath, 'utf8');
        return htmlContent;
    }
    catch (error) {
        vscode.window.showErrorMessage(`Failed to load webview HTML file from: ${htmlPath}`);
        return `<html><body><h1>Error loading webview</h1><p>Path: ${htmlPath}</p><p>Error: ${error}</p></body></html>`;
    }
}
function deactivate() {
    // Clean up
}
//# sourceMappingURL=extension.js.map