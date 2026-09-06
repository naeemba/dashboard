# dashboard

Keyboard-first terminal dashboard. Each project gets a page, shown three ways: five shells in a fixed grid, a full-window nvim, or a kanban board.

## Setup

    cp .env.example .env   # optional: SHELL_COMMAND
    npm install
    npm start

## Install

    npm run package
    cp -R out/Dashboard-darwin-*/Dashboard.app /Applications/

The installed app reads `$XDG_CONFIG_HOME/dashboard/.env` (falling back to `~/.config/dashboard/.env`) instead of the repo `.env`.

The window opens on the projects the last run was left on — the same order, each on the view it was showing, with the same pane focused; the layout lives in `session.json` under the app's data directory, next to `recents.json`. A project whose folder has since gone away comes back once as a dead tab and is then forgotten, so it costs you the tab on one launch rather than every launch. With nothing saved the window opens empty. Ctrl+S lists the projects you opened before and offers a folder dialog for a new one.

Closing the window asks first, because it kills every shell in every project and there is no getting a long-running task back. Cancel is the default, so Enter and Escape both mean "I hit that by accident".

## Shortcuts

Mod is Cmd on macOS, Ctrl on Linux and Windows.

| Action | Keys |
|---|---|
| Shortcuts for the screen you are on | Ctrl+H |
| Terminals mode | Ctrl+T |
| Nvim mode | Ctrl+N |
| Board mode | Ctrl+B |
| Open the project list | Ctrl+S |
| Back to the last project | Ctrl+O |
| Jump to project N | Ctrl+1..9 |
| Move the current project to position N | Ctrl+Shift+1..9 |
| Next / previous project | Mod+] / Mod+[ |
| Focus terminal N | Mod+1..5 (terminals mode, macOS only — see below) |
| Next / previous terminal | Mod+Right / Mod+Left (terminals mode) |
| Clear the shell's current line | Cmd+Backspace (macOS only — see below) |
| Move to the pane left / down / up / right | Option+H / J / K / L (Alt elsewhere, terminals mode) |
| Edit a card's title / description | Enter / `e` (board mode) |
| Add / delete a card | `n` / `d` (board mode) |
| Cycle a card's priority | `p` (board mode) |
| Sort a column by priority | `s` (board mode) |
| Undo the last board change | `u` (board mode) |

Ctrl+H lists them: the keys for the screen in front of you first, then the mode and project keys that
answer from anywhere. Escape or Enter closes it. It is the one shortcut no mode passes through — the
cost is that Ctrl+H no longer reaches a shell or nvim as a backspace.

## Modes

Each project remembers its own mode, so Ctrl+2 lands on project 2 in whatever view you left it in. The project keys work from all three; nothing else does — Mod+1..5 and Option+HJKL only mean something when the terminals are on screen.

The key naming the mode you are already in is passed through to whatever is running there, so Ctrl+N still completes a word inside nvim and Ctrl+T still transposes characters in a shell. You leave a mode by naming a different one.

Nvim starts the first time you press Ctrl+N for that project, not at launch. Quit it and the pane says `[exited 0] press Enter to restart`, like any shell that has exited.

The board lives in `.dashboard/board.json` inside the project, alongside a `README.md` and a `CLAUDE.md` describing the format. The folder is created the first time you open the board. Committing it is your call — nothing touches `.gitignore`.

Inside the board: arrows move the selection, Shift with an arrow moves the card itself, and the keys in the table above do the rest. A card carries a title, a description, and one of four priorities — `urgent`, `high`, `medium`, `low` — shown as a coloured stripe down its left edge and named in the status bar. `p` walks through the four, `s` sorts the column you are on with the urgent cards at the top. Every change is written straight to disk; there is no save key.

While a card is being edited, the input owns the keyboard: Ctrl+T, Ctrl+2, and every other global shortcut are dead until the edit ends. A title ends on Enter or Escape. A description ends on Escape only — Enter there is a newline, since a description is written as lines.

The board is re-read whenever you enter it, so edits made to `board.json` from outside show up when you switch away and back — not while you are looking at it. If the board file is broken — truncated by a crash, broken by a hand-edit, or carrying a merge conflict marker — it is renamed to `board.json.broken` before showing an empty board, and the status bar says so. Your old cards are in the renamed file.

## Known limitations

The project list is keyboard-only by design: type to filter, Up and Down move, Enter opens, Escape closes. Its last row, "Open a new project…", is a row like any other, so the folder dialog is reachable without the mouse — it is the only way in, there is no separate shortcut for it.

Ctrl+O returns to the project you were on before this one, so two projects toggle back and forth. Ctrl+Shift+1..9 reorders the projects: the one on screen takes that position and the rest shift along, the way dragging a tab works. Its shells keep running throughout; only the order you cycle and jump through changes.

Ctrl+S and Ctrl+O are plain Ctrl on every platform, macOS included, so the shell never receives them: no XOFF, no emacs reverse search, no readline operate-and-get-next inside a pane.

Cmd+Backspace sends Ctrl+U to the shell, which clears the whole line, not just the part before the cursor — zsh binds ^U to kill-whole-line. It is macOS only: on Linux and Windows Ctrl+U already reaches the shell on its own.

On Linux and Windows, the Ctrl modifier used for shortcuts also intercepts Ctrl+[ (Escape in terminals and vim) and Ctrl+Left/Right (word movement), making them unavailable inside the shell. Ctrl+1..9 belongs to the projects everywhere, so on those platforms Mod+1..5 cannot reach the terminals — use Mod+Left/Right or Option+HJKL instead. macOS keeps both, since its shortcuts use Cmd.

## Tests

    npm test
