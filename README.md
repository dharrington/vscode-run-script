# run-script README

Runs a shell command, and reads the output to do different things.

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

*parseStdout*: Whether to interpret the stdout as a JSON command. See the JSON commands section

*showStdoutPopup*: Whether to show stdout in a popup.

*copyStdoutToClipboard*: Whether to copy stdout to clipboard.

*timeout*: Kill the process after this many seconds.

*sendFileTextToStdin*: Whether to the current file text to stdin.

## JSON Commands

Run the vscode.open command. You can run any built-in command this way.
Note that built-in commands that take file paths need to use a file:///
URI.

  {
    "command": "vscode.open",
    "args": "file:///path/to/file"
  }

There are a few built-in commands provided by this extension:

  {
    "command": "goToLine",
    "line": 42
  }

  {
    "command": "open",
    "path": "path/to/file"
  }

  {
    "command": "replaceText",
    "line": 42,
    "column": 5,
    "toLine": 45,
    "toColumn": 6
  }

  {
    "command": "showInformationMessage",
    "message": "It worked",
    "items": [
      "Choose one", "Choose two"
    ],
    "onChoose": {
      "command": "echo 'You chose ${choice}'",
      "showStdoutPopup": true
    }
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

Command run-script.killAll: Terminate any previously started processes.

## Release Notes

### 1.0.0

Initial release!
