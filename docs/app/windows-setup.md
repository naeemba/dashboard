# Running Dashboard on Windows

Step by step, from a clean Windows machine to a running app. Every command is
for **PowerShell**; each step says which folder to run it in. The examples use
`C:\workspace\dashboard` as the parent folder; any folder works.

## First time

1. **Install the tools** (once per machine):
   - [Git for Windows](https://git-scm.com/download/win)
   - [Node.js 24](https://nodejs.org/) (the LTS installer, with "Add to PATH" left on)
   - Optional: [Claude Code](https://docs.claude.com/en/docs/claude-code), for the Claude screen and the workers

   Visual Studio is **not** needed: node-pty's prebuilt Windows binary is used,
   nothing is compiled.

2. **Check the tools.** Open a new PowerShell window, in any folder:

       git --version
       node -v        # v24.x

3. **Enable pnpm.** Open PowerShell **as Administrator** (Corepack writes into
   Node's install folder), in any folder:

       corepack enable

   Close the Administrator window. From here on use a normal PowerShell.

4. **Clone the repository.** In the parent folder:

       mkdir C:\workspace\dashboard -Force
       cd C:\workspace\dashboard
       git clone https://github.com/naeemba/dashboard.git
       cd dashboard

   Every step below runs in this folder, `C:\workspace\dashboard\dashboard`.

5. **Check pnpm**, in `C:\workspace\dashboard\dashboard`:

       pnpm -v        # the version package.json's packageManager pins

   If Corepack asks to download pnpm, answer `Y`.

6. **Optional: a `.env`**, in `C:\workspace\dashboard\dashboard`. Without it the
   panes run `powershell`; set `SHELL_COMMAND` to use another shell.

       Copy-Item .env.example .env
       notepad .env

7. **Install the dependencies**, in `C:\workspace\dashboard\dashboard`:

       pnpm install

8. **Run the app**, in `C:\workspace\dashboard\dashboard`:

       pnpm start

   The window opens. Close it, or press Ctrl+C in PowerShell, to stop it.

## Every time after that

1. Open PowerShell and go to the repository:

       cd C:\workspace\dashboard\dashboard

2. Take the latest changes and dependencies:

       git pull
       pnpm install

3. Run it:

       pnpm start

## Optional: install it as a normal app

Either download the `Setup.exe` from
[Releases](https://github.com/naeemba/dashboard/releases), or build one from the
checkout:

1. Quit every Dashboard that runs out of this folder (`pnpm run make` refuses
   while one runs, since it deletes `out\` and `.vite\`).
2. In `C:\workspace\dashboard\dashboard`:

       pnpm run make

3. Run the `Setup.exe` in `out\make\squirrel.windows\x64\`. SmartScreen says
   "Windows protected your PC": click **More info**, then **Run anyway**.

Or, from Git Bash, `./scripts/rebuild.sh` (the `/rebuild` command) runs
`pnpm install --frozen-lockfile`, then packages the checkout into
`%LOCALAPPDATA%\Programs\Dashboard`, apart from a Squirrel install, and
writes the `dashboard` launcher to `~/.local/bin` as `dashboard` (Git Bash)
and `dashboard.cmd` (cmd, PowerShell), and a "Dashboard (rebuild)" Start menu
entry that Windows search finds. It never quits the running
app; while a Dashboard runs from that folder Windows will not rename it, and
the script stops with the old build in place. The in-app update refuses this
build ("this build came from scripts/rebuild.sh; it updates by rebuilding"):
there is no Squirrel `Update.exe` above it to install a release.

The installed app reads its `.env` from
`%USERPROFILE%\.config\dashboard\.env`, not the repository's.

## Checks before a commit

In `C:\workspace\dashboard\dashboard`:

    pnpm test
    pnpm exec tsc --noEmit
    pnpm exec eslint .

## When something goes wrong

| What you see | What to do |
|---|---|
| The window opens empty, or a Chrome tab opens on `http://127.0.0.1:5173` | A checkout older than #287: `git pull`, then `pnpm start` again. "The window's own page" in [README.md](README.md) says what it was |
| `pnpm` is not recognized | Step 3 again, in an Administrator PowerShell, then open a new window |
| `pnpm start` exits and only brings a window to the front | The installed Dashboard is running: one app runs per userData folder. Quit it, or see "One app at a time" in [README.md](README.md) |
| `Failed to load native module: pty.node` or `node-pty has no built binary` | `pnpm install`, then `pnpm rebuild node-pty` |
| `pnpm run make` stops with "an app is running out of this repo" or `EBUSY` | Quit the Dashboard started with `pnpm start`, then run it again |
| Running scripts is disabled on this system | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, then a new PowerShell window |
