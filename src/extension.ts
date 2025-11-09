import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

let logsPanel: vscode.WebviewPanel | undefined;
const terminalData: { [key: string]: string } = {};
const terminalNames: { [key: string]: string } = {};

export function activate(context: vscode.ExtensionContext) {
	console.log('✓ Better Terminal Logs extension is now active!');

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
				delete terminalData[id];
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
				
				// Store data
				if (terminalData[id] !== undefined) {
					terminalData[id] += cleanedOutput;
				}

				// Send structured log to webview (CloudWatch style)
				if (logsPanel) {
					console.log('Sending log to webview:', cleanedOutput.substring(0, 50));
					logsPanel.webview.postMessage({
						command: 'addLog',
						terminalId: id,
						log: {
							date: new Date().toISOString(),
							data: cleanedOutput
						}
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
		if (terminalData[id] !== undefined) {
			console.log('Terminal already registered:', id);
			return;
		}
		
		// Get terminal name with fallback
		const terminalName = terminal.name || `Terminal ${Object.keys(terminalData).length + 1}`;
		
		terminalData[id] = '';
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

	// Send initial terminal list to webview
	setTimeout(() => {
		if (logsPanel) {
			Object.keys(terminalData).forEach(terminalId => {
				logsPanel!.webview.postMessage({
					command: 'addTerminal',
					terminalId: terminalId,
					terminalName: terminalNames[terminalId]
				});

				// Send existing data if any
				if (terminalData[terminalId]) {
					logsPanel!.webview.postMessage({
						command: 'addData',
						terminalId: terminalId,
						data: terminalData[terminalId]
					});
				}
			});
		}
	}, 100);

	logsPanel.webview.onDidReceiveMessage(
		message => {
			switch (message.command) {
				case 'clear':
					// Clear specific terminal data
					if (message.terminalId && terminalData[message.terminalId]) {
						terminalData[message.terminalId] = '';
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

