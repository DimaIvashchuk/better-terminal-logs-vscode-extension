import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

interface LogEntry {
	date: string;
	data: string;
	type?: 'error' | 'warning' | 'normal';
	isCommand?: boolean;
}

let logsPanel: vscode.WebviewPanel | undefined;
const terminalLogs: { [key: string]: LogEntry[] } = {};
const terminalNames: { [key: string]: string } = {};

export function activate(context: vscode.ExtensionContext) {
	console.log('✓ Better Terminal Logs extension is now active!');
	
	// Show activation notification
	vscode.window.showInformationMessage('🔍 Better Terminal Logs is now active!');

	// Command: Show Better Logs
	const showLogsCommand = vscode.commands.registerCommand('better-terminal-logs.showBetterLogs', () => {
		if (logsPanel) {
			logsPanel.reveal(vscode.ViewColumn.Two);
		} else {
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
    const shellExecutionListener = vscode.window.onDidStartTerminalShellExecution(async event => {
            const terminal = event.terminal;
            const execution = event.execution;

            const terminalId = await terminal.processId;
            if (!terminalId) { return; }
            
            const id = terminalId.toString();

            // Store and send the command that was executed
            const commandLine = execution.commandLine;
            if (commandLine && commandLine.value) {
                const logEntry: LogEntry = {
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
				const logEntry: LogEntry = {
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

	context.subscriptions.push(
		showLogsCommand, 
		terminalCreatedListener, 
		terminalClosedListener,
		shellExecutionListener
	);
}

function cleanTerminalOutput(data: string): string {
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
	
	// Clean up multiple consecutive newlines (keep max 2)
	cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
	
	return cleaned;
}

function detectLogType(text: string): 'error' | 'warning' | 'normal' {
	const lowerText = text.toLowerCase();
	
	// Error patterns
	const errorPatterns = [
		/\berror\b/i,
		/\bfailed\b/i,
		/\bfailure\b/i,
		/\bexception\b/i,
		/\bfatal\b/i,
		/\bcannot\b/i,
		/\bunable to\b/i,
		/\bnot found\b/i,
		/\binvalid\b/i,
		/\bdenied\b/i,
		/\brefused\b/i,
		/exit code [1-9]/i,
		/^(\s*)at\s+/m, // Stack traces
		/\[ERROR\]/i,
		/ERR!/i,
		/✗|❌|⨯/,
	];
	
	// Warning patterns
	const warningPatterns = [
		/\bwarn(ing)?\b/i,
		/\bcaution\b/i,
		/\bdeprecated\b/i,
		/\[WARN\]/i,
		/⚠/,
	];
	
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

async function registerTerminalForCapture(terminal: vscode.Terminal) {
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
	} catch (error) {
		console.error('Error registering terminal:', error);
	}
}

function createLogsPanel(context: vscode.ExtensionContext) {
	logsPanel = vscode.window.createWebviewPanel(
		'collapsibleLogs',
		'Better Terminal Logs',
		vscode.ViewColumn.Two,
		{
			enableScripts: true,
			retainContextWhenHidden: true
		}
	);

	logsPanel.webview.html = getWebviewContent(context);

	// Send initial terminal list and replay all stored logs
	setTimeout(() => {
		if (logsPanel) {
			Object.keys(terminalLogs).forEach(terminalId => {
				logsPanel!.webview.postMessage({
					command: 'addTerminal',
					terminalId: terminalId,
					terminalName: terminalNames[terminalId]
				});

				// Replay all stored logs for this terminal
				if (terminalLogs[terminalId] && terminalLogs[terminalId].length > 0) {
					console.log(`Replaying ${terminalLogs[terminalId].length} logs for terminal ${terminalId}`);
					terminalLogs[terminalId].forEach(logEntry => {
						logsPanel!.webview.postMessage({
							command: 'addLog',
							terminalId: terminalId,
							log: logEntry
						});
					});
				}
			});
		}
	}, 100);

	logsPanel.webview.onDidReceiveMessage(
		message => {
			switch (message.command) {
				case 'clear':
					// Clear specific terminal logs
					if (message.terminalId && terminalLogs[message.terminalId]) {
						terminalLogs[message.terminalId] = [];
					}
					return;
			}
		},
		undefined,
		context.subscriptions
	);

	logsPanel.onDidDispose(
		() => {
			logsPanel = undefined;
		},
		null,
		context.subscriptions
	);
}

function getWebviewContent(context: vscode.ExtensionContext): string {
	const htmlPath = path.join(context.extensionPath, 'src', 'webview', 'index.html');
	
	try {
		const htmlContent = fs.readFileSync(htmlPath, 'utf8');
		return htmlContent;
	} catch (error) {
		vscode.window.showErrorMessage('Failed to load webview HTML file.');
		return '<html><body><h1>Error loading webview</h1></body></html>';
	}
}

export function deactivate() {
	// Clean up
}

