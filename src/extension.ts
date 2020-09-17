import * as vscode from 'vscode';
import * as child_process from 'child_process';
import { Uri } from 'vscode';
import * as jsonc from 'jsonc-parser';

function getProperty(obj: any, propertyName: string, defaultValue: any) {
	return obj.hasOwnProperty(propertyName) ? obj[propertyName] : defaultValue;
}

function lineAtOffset(text: string, offset: number) {
	let count = 0;
	let start = 0;
	while (1) {
		let next = text.indexOf('\n', start);
		if (next < 0 || next >= offset) {
			break;
		}
		count++;
		start = next + 1;
	}
	return count;
}

function transformJSON(o: any, basicConverter: any) {
	if (Array.isArray(o)) {
		for (let i = 0; i < o.length; i++) {
			o[i] = transformJSON(o[i], basicConverter);
		}
		return o;
	}
	if (typeof o === 'object') {
		for (var i in o) {
			o[i] = transformJSON(o[i], basicConverter);
		}
		return o;
	}
	return basicConverter(o);
}

function fixUpCommandArgs(args: any) {
	return transformJSON(args, (o: any) => {
		if (typeof o === 'string') {
			if (o.startsWith('file://')) {
				return Uri.file(o.substr(7));
			}
		}
		return o;
	});
}

function replaceText(line: number, col: number, replaceToLine: number, replaceToCol: number, text: string): Thenable<any> {
	if (!vscode.window.activeTextEditor) {
		return Promise.resolve();
	}
	return vscode.window.activeTextEditor.edit((e) => {
		e.replace(new vscode.Range(new vscode.Position(line, col),
			new vscode.Position(replaceToLine, replaceToCol)), text);
	});
}

function gotoLine(line: number) {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		return Promise.resolve();
	}

	editor.selection = new vscode.Selection(line, 0, line, 0);
	editor.revealRange(new vscode.Range(line, 0, line, 10000));
	return Promise.resolve();
}

function open(fileName: string) {
	return vscode.commands.executeCommand('vscode.open', Uri.file(fileName));
}

function gotoText(searchText: string) {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		return Promise.resolve();
	}
	const documentText = editor.document.getText();
	const offset = documentText.indexOf(searchText);
	if (offset >= 0) {
		const pos = editor.document.positionAt(offset);
		editor.selection = new vscode.Selection(pos, pos.translate(0, searchText.length));
		editor.revealRange(editor.selection);
	}
	return Promise.resolve();
}

function getWorkspaceFolder() {
	if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
		return vscode.workspace.workspaceFolders[0].uri.path;
	}
	return undefined;
}

function substituteVariable(text: string, choice: string) {
	if (text === "${file}") {
		let textEditor = vscode.window.activeTextEditor;
		if (textEditor) {
			return textEditor.document.fileName;
		}
		return "";
	}
	if (text === "${workspaceFolder}") {
		return getWorkspaceFolder() || "";
	}
	if (text === "${lineNumber}") {
		if (vscode.window.activeTextEditor) {
			return '' + vscode.window.activeTextEditor.selection.anchor.line;
		}
		return "";
	}
	if (text === "${column}") {
		if (vscode.window.activeTextEditor) {
			return '' + vscode.window.activeTextEditor.selection.anchor.character;
		}
		return "";
	}
	if (text === "${selectedText}") {
		if (vscode.window.activeTextEditor) {
			return vscode.window.activeTextEditor.document.getText(vscode.window.activeTextEditor.selection);
		}
		return "";
	}
	if (text === '${choice}') {
		return choice;
	}
	if (text.startsWith("${config:")) {
		const varName = text.substr(9, text.length - 10);
		if (vscode.workspace.getConfiguration().has(varName)) {
			return '' + vscode.workspace.getConfiguration().get(varName);
		}
		return "";
	}
	return text;
}

export function activate(context: vscode.ExtensionContext) {
	const outputChannel = vscode.window.createOutputChannel("Run-Script");

	let runningProcesses: child_process.ChildProcess[] = [];

	const interpretCommand = (json: any): Thenable<unknown> => {
		if (json.hasOwnProperty('command')) {
			const cmd = json['command'];
			if (cmd === 'open') {
				return open(json.path).then(() => {
					if (json.hasOwnProperty('line')) {
						return gotoLine(Number(json.line));
					}
					if (json.hasOwnProperty('text')) {
						return gotoText(json.text);
					}
				});
			}
			if (cmd === 'goToLine') {
				gotoLine(Number(json.line));
				return Promise.resolve();
			}
			if (cmd === 'goToText') {
				gotoText(json.text);
				return Promise.resolve();
			}
			if (cmd === 'replaceText') {
				const line = Number(json.line);
				const col = Number(json.column);
				const toLine = Number(getProperty(json, 'toLine', line));
				const toCol = Number(getProperty(json, 'toColumn', col));
				return replaceText(line, col, toLine, toCol, json['text']);
			}
			if (cmd === 'showInformationMessage') {
				const items = getProperty(json, 'items', []);
				const onChoose = getProperty(json, 'onChoose', undefined);
				const onCancel = getProperty(json, 'onCancel', undefined);
				const promise = vscode.window.showInformationMessage(json.message, ...items);
				if (onChoose) {
					return promise.then((result) => {
						if (result) {
							if (onChoose) {
								return runCommand(onChoose, '' + result);
							}
						} else {
							if (onCancel) {
								return runCommand(onCancel, '');
							}
						}
						return Promise.resolve();
					});
				}
				return Promise.resolve();
			}
			if (cmd === 'showQuickPick') {
				const items = getProperty(json, 'items', []);
				const onChoose = getProperty(json, 'onChoose', undefined);
				const onCancel = getProperty(json, 'onCancel', undefined);
				return vscode.window.showQuickPick(items).then((result) => {
					if (result) {
						if (onChoose) {
							return runCommand(onChoose, '' + result);
						}
					} else {
						if (onCancel) {
							return runCommand(onCancel, '');
						}
					}
					return Promise.resolve();
				});
			}
			if (json.hasOwnProperty('args')) {
				return vscode.commands.executeCommand(json.command, fixUpCommandArgs(json.args));
			} else {
				return vscode.commands.executeCommand(json.command);
			}
		}
		if (json.hasOwnProperty('code')) {
			(function () {
				eval(json.code);
			})();
			return Promise.resolve();
		}

		vscode.window.showInformationMessage('Dont know how to interpret: ' + json);
		return Promise.resolve();
	};

	const interpretCommandList = (commands: any): Thenable<any> => {
		if (commands.length) {
			const cmd = commands[0];
			commands.splice(0, 1);
			return interpretCommand(cmd).then(() => {
				return interpretCommandList(commands);
			});
		}
		return Promise.resolve();
	};

	const runCommand = (args: any, choice: string): Thenable<any> => {
		return new Promise((resolve) => {
			const parseStdout = getProperty(args, 'parseStdout', false);
			const showStdoutPopup = getProperty(args, 'showStdoutPopup', false);
			const showStderrPopup = getProperty(args, 'showStderrPopup', false);
			const copyStdoutToClipboard = getProperty(args, 'copyStdoutToClipboard', false);
			const sendFileTextToStdin = getProperty(args, 'sendFileTextToStdin', false);
			const timeout = getProperty(args, 'timeout', 0.0);

			let command = args['command'];
			const variableRegEx = /\$\{[a-zA-Z:_.]+\}/g;
			const matches = [];
			let match;
			while ((match = variableRegEx.exec(command)) !== null) {
				matches.push([match[0] as string, variableRegEx.lastIndex]);
			}

			for (let i = matches.length - 1; i >= 0; i--) {
				const m = matches[i][0] as string;
				const endIndex = matches[i][1] as number;
				command = command.substr(0, endIndex - m.length) + substituteVariable(m, choice) + command.substr(endIndex);
			}
			const proc = child_process.spawn(command, { shell: true, cwd: getWorkspaceFolder() });
			let stdoutBuffer: string[] = [];
			let stderrBuffer: string[] = [];
			proc.stdout.on('data', (data) => {
				stdoutBuffer.push(data);
			});
			proc.stderr.on('data', (data) => {
				stderrBuffer.push(data);
			});
			if (sendFileTextToStdin && vscode.window.activeTextEditor) {
				proc.stdin.write(
					vscode.window.activeTextEditor.document.getText());
			}
			proc.stdin.end();

			proc.on("exit", (exitCode) => {
				const stdout = stdoutBuffer.join('');
				const stderr = stderrBuffer.join('');
				const index = runningProcesses.indexOf(proc);
				if (index > -1) {
					runningProcesses.splice(index, 1);
				}

				if (showStdoutPopup) {
					vscode.window.showInformationMessage(stdout);
				}
				if (showStderrPopup) {
					vscode.window.showInformationMessage(stderr);
				}
				if (exitCode) {
					outputChannel.appendLine('run-script: process error: ' + exitCode + "\nstderr:\n" + stderr + '\nstdout:\n' + stdout);
					resolve();
					return;
				}
				if (copyStdoutToClipboard) {
					vscode.env.clipboard.writeText(stdout);
				}
				if (parseStdout) {
					let result;
					const errors: jsonc.ParseError[] = [];
					result = jsonc.parse(stdout, errors, {
						allowEmptyContent: true,
						allowTrailingComma: true,
					});
					if (errors.length) {
						const line = lineAtOffset(stdout, errors[0].offset);
						outputChannel.appendLine(`run-script: error parsing json at line ${line + 1}: ${stdout}`);
						resolve();
						return;
					}
					if (Array.isArray(result)) {
						interpretCommandList(result).then(resolve);
						return;
					} else {
						interpretCommand(result).then(resolve);
						return;
					}
				}
				resolve();
			});
			runningProcesses.push(proc);
			if (timeout > 0) {
				setTimeout(() => {
					try {
						proc.kill();
					} catch (error) { }
				}, timeout * 1000);
			}
		});
	};


	let disposable = vscode.commands.registerCommand('run-script.run', (args) => {
		runCommand(args, "");
	});
	context.subscriptions.push(disposable);

	context.subscriptions.push(vscode.commands.registerCommand('run-script.killAll', (args) => {
		const procs = runningProcesses;
		runningProcesses = [];
		for (const p of procs) {
			try {
				p.kill();
			} catch (error) { }
		}
	}));

}

export function deactivate() { }
