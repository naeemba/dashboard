# dashboard

Keyboard-first terminal dashboard. Each project gets a page with five shells in a fixed grid.

## Setup

    cp .env.example .env   # optional: PROJECTS to open at launch
    npm install
    npm start

## Install

    npm run package
    cp -R out/Dashboard-darwin-arm64/Dashboard.app /Applications/

The installed app reads `~/.config/dashboard/.env` instead of the repo `.env`.

## Shortcuts

Mod is Cmd on macOS, Ctrl on Linux and Windows.

| Action | Keys |
|---|---|
| Open a project folder | Ctrl+S |
| Next / previous project | Mod+] / Mod+[ |
| Jump to project N | Mod+Shift+1..9 |
| Focus terminal N | Mod+1..5 |
| Next / previous terminal | Mod+Right / Mod+Left |
| Move to the pane left / down / up / right | Option+H / J / K / L (Alt elsewhere) |

## Known limitations

On Linux and Windows, the Ctrl modifier used for shortcuts also intercepts Ctrl+[ (Escape in terminals and vim) and Ctrl+Left/Right (word movement), making them unavailable inside the shell. macOS is unaffected, since shortcuts use Cmd instead.

## Tests

    npm test
