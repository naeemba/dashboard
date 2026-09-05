# dashboard

Keyboard-first terminal dashboard. Each project gets a page with five shells in a fixed grid.

## Setup

    cp .env.example .env   # optional: SHELL_COMMAND
    npm install
    npm start

## Install

    npm run package
    cp -R out/Dashboard-darwin-*/Dashboard.app /Applications/

The installed app reads `$XDG_CONFIG_HOME/dashboard/.env` (falling back to `~/.config/dashboard/.env`) instead of the repo `.env`.

The window opens empty. Ctrl+S lists the projects you opened before and offers a folder dialog for a new one; the list lives in `recents.json` under the app's data directory.

## Shortcuts

Mod is Cmd on macOS, Ctrl on Linux and Windows.

| Action | Keys |
|---|---|
| Open the project list | Ctrl+S |
| Back to the last project | Ctrl+O |
| Jump to project N | Ctrl+1..9 |
| Move the current project to position N | Ctrl+Shift+1..9 |
| Next / previous project | Mod+] / Mod+[ |
| Focus terminal N | Mod+1..5 (macOS only — see below) |
| Next / previous terminal | Mod+Right / Mod+Left |
| Move to the pane left / down / up / right | Option+H / J / K / L (Alt elsewhere) |

## Known limitations

The project list is keyboard-only by design: type to filter, Up and Down move, Enter opens, Escape closes. Its last row, "Open a new project…", is a row like any other, so the folder dialog is reachable without the mouse — it is the only way in, there is no separate shortcut for it.

Ctrl+O returns to the project you were on before this one, so two projects toggle back and forth. Ctrl+Shift+1..9 reorders the projects: the one on screen takes that position and the rest shift along, the way dragging a tab works. Its shells keep running throughout; only the order you cycle and jump through changes.

Ctrl+S and Ctrl+O are plain Ctrl on every platform, macOS included, so the shell never receives them: no XOFF, no emacs reverse search, no readline operate-and-get-next inside a pane.

On Linux and Windows, the Ctrl modifier used for shortcuts also intercepts Ctrl+[ (Escape in terminals and vim) and Ctrl+Left/Right (word movement), making them unavailable inside the shell. Ctrl+1..9 belongs to the projects everywhere, so on those platforms Mod+1..5 cannot reach the terminals — use Mod+Left/Right or Option+HJKL instead. macOS keeps both, since its shortcuts use Cmd.

## Tests

    npm test
