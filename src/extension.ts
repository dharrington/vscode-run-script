import * as vscode from 'vscode';
import * as child_process from 'child_process';
import { Uri } from 'vscode';

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
	if (!vscode.window.activeTextEditor) {
		return;
	}
	const editor = vscode.window.activeTextEditor;
	vscode.window.activeTextEditor.selection = new vscode.Selection(line, 0, line, 0);
	vscode.window.activeTextEditor.revealRange(new vscode.Range(line, 0, line, 10000));
}

function open(fileName: string) {
	return vscode.commands.executeCommand('vscode.open', Uri.file(fileName));
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
		if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
			return vscode.workspace.workspaceFolders[0].uri.path;
		}
		return "";
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
				return open(json['path']);
			}
			if (cmd === 'goToLine') {
				gotoLine(json['line']);
				return Promise.resolve();
			}
			if (cmd === 'replaceText') {
				const line = json.line;
				const col = json.column;
				const toLine = json.hasOwnProperty('toLine') ? json.toLine : line;
				const toCol = json.hasOwnProperty('toColumn') ? json.toColumn : col;
				return replaceText(line, col, toLine, toCol, json['text']);
			}
			if (cmd === 'showInformationMessage') {
				const items = json.hasOwnProperty('items') ? json.items : [];
				const onChoose = json.hasOwnProperty('onChoose') ? json.onChoose : undefined;
				const promise = vscode.window.showInformationMessage(json.message, ...items);
				if (onChoose) {
					return promise.then((result) => {
						runCommand(onChoose, '' + result);
					});
				}
				return Promise.resolve();
			}
			if (cmd === 'showQuickPick') {
				const items = json.hasOwnProperty('items') ? json.items : [];
				const onChoose = json.hasOwnProperty('onChoose') ? json.onChoose : undefined;
				return vscode.window.showQuickPick(items).then((result) => {
					runCommand(onChoose, '' + result);
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

	const interpretCommandList = (commands: any) => {
		if (commands.length) {
			const cmd = commands[0];
			commands.splice(0, 1);
			interpretCommand(cmd).then(() => {
				interpretCommandList(commands);
			});
		}
	};

	const runCommand = (args: any, choice: string) => {
		const parseStdout = args.hasOwnProperty('parseStdout') ? args.parseStdout : false;
		const showStdoutPopup = args.hasOwnProperty('showStdoutPopup') ? args.parseStdout : false;
		const showStderrPopup = args.hasOwnProperty('showStderrPopup') ? args.showStderrPopup : false;
		const copyStdoutToClipboard = args.hasOwnProperty('copyStdoutToClipboard') ? args.parseStdout : false;
		const sendFileTextToStdin = args.hasOwnProperty('sendFileTextToStdin') ? args.sendFileTextToStdin : false;
		const timeout = args.hasOwnProperty('timeout') ? args.timeout : 0.0;

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
		const proc = child_process.spawn(command, { shell: true });
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
				return;
			}
			if (copyStdoutToClipboard) {
				vscode.env.clipboard.writeText(stdout);
			}
			if (parseStdout) {
				let result;
				try {
					result = JSON.parse(stdout);
				} catch (error) {
					outputChannel.appendLine('run-script: error parsing json: ' + stdout);
					return;
				}
				if (Array.isArray(result)) {
					interpretCommandList(result);
				} else {
					interpretCommand(result);
				}
			}
		});
		runningProcesses.push(proc);
		if (timeout > 0) {
			setTimeout(() => {
				try {
					proc.kill();
				} catch (error) { }
			}, timeout * 1000);
		}
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
