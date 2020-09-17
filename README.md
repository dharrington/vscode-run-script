# run-script README

Runs a shell command, and reads the output to do different things.

Lets your external scripts / programs integrate more tightly with vscode: 
open and modify files, show messages, and more.

## Features

Includes a single command: run-script.run.

To use this command, set up shortcuts like this:

    {
        "key": "ctrl+shift+h",
        "command": "run-script.run",
        "args": {
            "command": "path/to/some/binary ${file}",
            "parseStdout": true,
        }
    }

Arguments for run:

*command*: Required. The shell command to run. Supports the following substitutions:

* ${file} - Path of the current open file.
* ${workspaceFolder} - Path of the workspace folder.
* ${lineNumber} - Line number of the cursor.
* ${column} - Column of the cursor.
* ${selectedText} - Current selected text.
* ${config:some.configVar} - Config variable from settings.

*parseStdout*: Whether to interpret the stdout as a JSON command. See the JSON commands section

*showStdoutPopup*: Whether to show stdout in a popup.

*showStderrPopup*: Whether to show stderr in a popup.

*copyStdoutToClipboard*: Whether to copy stdout to clipboard.

*timeout*: Kill the process after this many seconds.

*sendFileTextToStdin*: Whether to the current file text to stdin.

## JSON Commands

If **parseStdout** is enabled for a key binding command, the stdout
of the script is interpreted as a JSON command. This is a mechanism
for your scripts to cause effects on vscode.

There are several built-in commands provided by this extension:

Jump to line in the current file.

    {
      "command": "goToLine",
      "line": 42
    }

Jump to the first occurence of a search string in the current file.

    {
      "command": "goToText",
      "text": "some match"
    }

Open a file. 

    {
      "command": "open",
      "path": "path/to/file"
      // You can also specify "text" or "line" to jump to text or line.
    }

Insert and/or replace text.

    {
      "command": "replaceText",
      "line": 42,
      "column": 5,
      "toLine": 45,
      "toColumn": 6,
      "text": "some text"
    }

Show an informational message. Optionally, provide items the user can click.

    {
      "command": "showInformationMessage",
      "message": "It worked",
      // Interactivity, optional:
      "items": [
        "Choose one", "Choose two"
      ],
      "onChoose": {
        "command": "echo 'You chose ${choice}'",
        "showStdoutPopup": true
      }
      "onCancel": {
        "command": "echo 'User did not pick anything'",
        "showStdoutPopup": true
      }
    }

Request user input from the quick pick control.

    {
      "command": "showQuickPick",
      "items": [
        "Choose one", "Choose two"
      ],
      "onChoose": {
        "command": "echo 'You chose ${choice}'",
        "showStdoutPopup": true
      },
      "onCancel": {
        "command": "echo 'User did not pick anything'",
        "showStdoutPopup": true
      }
    }

Or, run any built-in vscode command. This runs the vscode.open command.
You can run any built-in command this way.
Note that built-in commands that take file paths need to use a file:/// URI.

    {
      "command": "vscode.open",
      "args": "file:///path/to/file"
    }

Evaluate arbitrary javascript:

    {
      "code": "vscode.window.activeTextEditor.selection = new vscode.Selection(123, 0, 123, 0);"
    }

Run multiple commands using an array:

    [
      {
          "command": ...
      },
      {
          "command": ...
      }
    ]

## Extras

* Errors are logged to the 'Run-Script' output window.
* Command run-script.killAll: Terminate any previously started processes.

## Release Notes

### 1.0.0

Initial release!

### 1.0.1

Add showStderrPopup option.

Fixed some bugs:
* stdout/stderr was concatenated incorrectly
* showStdoutPopup works even if the process exits uncleanly

### 1.0.2

* Add showQuickPick
* Small bugfix, improve readme

### 1.0.3

* Add goToText
* Add onCancel for showInformationMessage and showQuickPick.
* Trailing comma and comments are now allowed in json.
* Changed default process CWD to workspace folder.
* Some bugfixes.