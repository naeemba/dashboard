# dashboard

Electron terminal dashboard. Each project is a page of five shells, an nvim, a
kanban board and a notes page.

Settled questions live in `docs/decisions.md`. What breaking each rule below
looked like lives in `docs/hard-rules.md`. Read the matching section before
arguing with a rule.

## Checks

    npm test        # vitest, node environment only
    npx tsc --noEmit
    npx eslint .

There is no DOM test environment: jsdom is not installed and nothing in `src/`
declares one. A `*.test.ts` can test a decision module, never a view. DOM
behaviour (focus, re-attaching an element, `hidden`) is checked by hand in the
app.

## Hard rules

- **Never quit, kill, restart or replace the running Dashboard app** unless
  asked in the same conversation. No `npm run package` into /Applications, no
  `osascript ... quit`, no `pkill`, no `open -a Dashboard`. Building into
  `out/` or `.vite/` is fine. After a change: run the checks, say the installed
  app needs a rebuild and restart, stop.
- **Keyboard first.** Every action is reachable without the mouse; a new choice
  is a row the arrow keys walk, not a button. A click on a row moves the
  selection there, then does what Enter does there. A mouse gesture on one of
  the manager's boards makes that board active first.
- **Mode keys pass through.** The key naming the mode you are already in goes
  to the pane. Every dialog that reads `event.key` checks
  `if (isModified(event)) return;` first (the manager list asks `isBareCharacter`
  because it takes Shift on purpose). Exceptions, each on purpose: Tab in a
  search box and the notes box; every key in the settings
  screen while a row is armed; Shift on the manager list. A new project view is
  a row in `PROJECT_MODES`, a row in `ACTIONS`, a view in `page.ts`, a branch in
  `focusMode` and `modeLabel`, and a name and blurb in `src/help.ts`.
- **Every `<input>` and `<textarea>` gets `dir = 'auto'`** in the change that
  adds it. These two counts agree:

      grep -rn "createElement('input')\|createElement('textarea')" src/ | wc -l
      grep -rn "dir = 'auto'" src/ | wc -l

- **`hidden` only hides what the stylesheet left alone.** A class that sets
  `display` needs a `.thing[hidden] { display: none }` beside it for every
  element it hides with the attribute.
- **A refusal is explained where it is decided.** Export the predicate from the
  file that enforces the refusal; the file that prints the message calls it.
  Never a second copy of the condition, in code or in a comment. `blockingChanges`
  exempts `.dashboard/` on purpose; `changedFiles` does not. An error shown to a
  person goes through `failureText`. This prints nothing:

      grep -rn "String(error)" src/ | grep -v 'failure.ts\|board-cli.ts\|board-view.ts\|notes-view.ts'

  `board-view.ts` and `notes-view.ts` are exempted only until fixed; adding a
  file to that list without fixing it is the rule being broken.
- **The help dialog is part of the change.** A key, mode or screen change
  updates `src/help.ts` in the same change: a new key is a row in
  `src/actions.ts` (handler, help, settings and which-key strip all read it); a
  screen that does something new gets its blurb updated.
- **A decision gets its own module and a test.** `renderer.ts` is wiring. A
  rule with branches goes in a small module beside a `.test.ts`. Main-process
  event wiring and spawning are exempt wherever they live; a branch owes a test
  wherever it lives.
- **The board has two writers.** The app and the `board` command both write
  `.dashboard/board.json`, only through `board.ts` and `board-store.ts`.
  `board-cli.ts` holds the command's decisions, `board-cli-entry.ts` the file
  and terminal. Main watches the `.dashboard` folder, not the file.
- **A card with a pull request open goes in `Review`, not `Done`.** This beats
  the global "move to Done when the PR is ready". The move into `Done` happens
  on the branch first, then the merge, then the app's board.
- **IPC channels are `<noun>:<verb>`**: `link:open`, `board:read`, `pty:resize`.
- **Every merged card bumps `package.json` `version`** in the same pull
  request: patch for a fix, minor for a capability, major for a break.
