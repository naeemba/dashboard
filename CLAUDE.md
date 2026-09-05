# dashboard

Electron terminal dashboard. Each project is a page of five shells.

## Never rebuild or restart the running app — Hard Rule

**Do not quit, kill, restart, or replace the Dashboard app running on this machine
unless I ask for it in that same conversation.** No `npm run package` into
/Applications, no `osascript ... quit`, no `pkill`, no `open -a Dashboard`.

Restarting kills every shell inside it. There are long-running tasks in those
panes; when the app dies, so does the work, with no way to get it back. The quit
also fires node-pty's exit callback during teardown, so it surfaces as a SIGABRT
crash report and looks like the app broke.

After changing code: run the tests, say the installed app needs a rebuild and
restart to pick the change up, and stop there. Building into `out/` or `.vite/`
is fine — nothing is running from those.

## Keyboard first — Hard Rule

Every action must be reachable from the keyboard alone. A control that only
responds to a click is unfinished.

In practice: a new choice belongs in a list the arrow keys already walk over,
not in a button beside it. If something new needs a click, it needs a key too,
and the key is the part that has to work.

## Checks

    npm test        # vitest
    npx tsc --noEmit
    npx eslint .
