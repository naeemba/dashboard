# Terminal Dashboard v1

## Goal

A keyboard-first desktop app that replaces tmux for day-to-day project
switching. Opens a fixed set of projects, gives each one five shells in a
fixed grid, and switches between projects and shells with shortcuts.

Later features (markdown viewer, file tree, git) are out of scope for v1
and get their own spec.

## Stack

- Electron
- xterm.js for terminal rendering
- node-pty for spawning shells
- TypeScript, no UI framework. Plain DOM is enough for one grid.

## Projects

- Read from `.env` at app root. `.env` is gitignored.
- Format: `PROJECTS=/path/one,/path/two,/path/three`
- Optional: `SHELL_COMMAND=/bin/zsh`. Falls back to `$SHELL`, then per
  platform: zsh (macOS), bash (Linux), powershell (Windows).
- Missing directory: show the project with an error in place of the
  terminals. Do not crash, do not skip silently.

## Layout

- One app window. One page per project, only the active page visible.
- Each page: five terminals. Row one has two, row two has three. Equal
  widths within a row, rows split the height evenly. Not resizable.
- Each shell starts in the project directory.
- A thin bar shows the project name and which terminal is focused.

## Shortcuts

Modifier is Cmd on macOS, Ctrl on Linux and Windows.

| Action | Keys |
|---|---|
| Next / previous project | Mod+] / Mod+[ |
| Jump to project N | Mod+Shift+1..9 |
| Focus terminal N | Mod+1..5 |
| Next / previous terminal | Mod+Right / Mod+Left |

Shortcuts are intercepted before xterm.js sees the keystroke so the shell
never receives them. Everything else goes to the shell. Mouse click also
focuses a terminal.

## Process model

- Main process: spawns and owns all PTYs, one per terminal, all at
  startup. Relays data between PTY and renderer over IPC.
- Renderer: one xterm.js instance per terminal. Sends keystrokes and
  resize events to main.
- Shell exits: terminal shows "exited, press Enter to restart" and a
  keypress respawns it.
- App quit: kills all PTYs. No persistence in v1.

## Not in v1

- Resizable panes, custom layouts, adding or removing terminals
- Session persistence across app restarts
- Adding projects from the UI
- Themes, settings screen
- Markdown, file tree, git

## Testing

- One unit test: `.env` parsing, including missing and malformed values.
- One unit test: shortcut-to-action mapping.
- Manual: launch with three projects, verify grid, switch with keys,
  kill a shell and respawn it.
