# dashboard

Keyboard-first terminal dashboard. Each project gets a page with five shells in a fixed grid.

## Setup

    cp .env.example .env   # set PROJECTS to your directories
    npm install
    npm start

## Shortcuts

Mod is Cmd on macOS, Ctrl on Linux and Windows.

| Action | Keys |
|---|---|
| Next / previous project | Mod+] / Mod+[ |
| Jump to project N | Mod+Shift+1..9 |
| Focus terminal N | Mod+1..5 |
| Next / previous terminal | Mod+Right / Mod+Left |

## Tests

    npm test
