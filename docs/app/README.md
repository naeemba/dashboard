# App

The window, its pages and what a restart puts back. Main owns the projects that
are open and the files under `.dashboard/`; the renderer draws one page per
project and wires every other feature into it.

## On screen

What each screen does, in full. The help dialog keeps only a short
blurb for it; this is where the rest lives.

### Log

What the app did and what went wrong, newest first: errors, panes and agents
exiting, cards moving, ships, worktrees, projects opening and closing. Type in
the box to filter — every word must appear, so `error ship` is the ships that
failed. Kept in dashboard.log in the app's data folder, 5 files of 5 MB; the
path is at the top. Never what you type in a pane.

### What's new

The pull requests merged into the build you are running, under the day each
merged, newest first. It opens by itself on the first launch of a build whose
stamp differs from the one it last spoke for, with only what merged since the
newest entry shown then; a release build heads it with its version. Not shown
for the same build again, for a build that merged nothing new (a board commit on
main), or on the very first install, which only remembers the build. A userData
folder with a saved session but no record yet (an update from a build before
this) gets the whole list. Ctrl+Shift+L opens it with the whole list any time.
The arrows walk the rows, Page Up and Page Down jump ten, Home and End go to
the ends, Enter opens the selected pull request on GitHub and leaves the list
up, Escape closes.

The list is read from git when the renderer is built (`vite.changelog.ts`):
`git log --first-parent --merges` for subjects `Merge pull request #N`, the
title from the first line of the merge's body, capped at 200, plus `origin`'s
`owner/name` for the links and, when HEAD carries the `v<version>` tag, that
tag as the release heading. A local `rebuild.sh` and a release build read it the
same way. A shallow clone has only the merges it fetched, so a release build
checks out with full history. Outside a git checkout the list is empty, the
same as the version stamp's `unknown`.

What it last showed is `whats-new.json` in userData: the newest entry the last
build carried. The same build carries the same newest entry, so that alone tells
a new build that merged something from one that did not. The renderer hands main
what this build carries over `whats-new:record` and gets back the record before,
so the record moves forward whether or not anything is shown; the same build
again, or an older one, writes nothing (`recordMovesForward`). Which entries to
show is `entriesToShow` in `whats-new.ts`: the last shown entry is found by its
commit, and one this build no longer carries is passed by time, so an older
build installed over a newer one shows nothing. `whats-new:record` is a client
channel: on a remote screen it answers for this install, not the host's.

## Files

Folders: `src/main/`, `src/main/app/`, `src/preload/`, `src/shared/app/`, `src/renderer/`, `src/renderer/app/`.

A new file goes in `src/<process>/<feature>/`. The process is the side that
runs it (a type-only import does not count): `main/` when only main or the two
command entries reach it, `renderer/` when only `renderer.ts` does (every
stylesheet too), `shared/` when both do, `preload/` for the preload, and `shared/` for a
file nothing runs: a module of types, or a helper only tests import. The feature
is the `docs/<feature>/` folder whose Files list names it. Basenames keep their
prefix (`renderer/chat/chat-view.ts`), and a test sits beside its module.

A type that both sides name lives on the shared side, never in a file of one
process. It goes in the shared module that owns its concept (`FileLink` in
`links.ts`, `PermissionAsk` in `chat-elicitation.ts`, `SearchRow` in
`fuzzy.ts`, `Board` in `board.ts`); one the bridge carries that no shared
module owns (`Project`, `WorktreeEntry`, `Session`, `ChatState`, ...) is
declared in `bridge.ts`, beside the contract that carries it. A shared test
imports only shared modules: a case that needs a renderer module lives in that
module's test.

`pnpm exec eslint .` holds the line (app-rule-2, rules in `eslint.config.mjs`): a file
in `renderer/` imports nothing from `main/` or `preload/`, one in `main/` nothing
from `renderer/` or `preload/`, one in `preload/` or `shared/` only from
`shared/`; and a package that needs Node or the DOM is a value import only on
its own side. `eslint.config.test.ts` pins each of those.

- Process and window: `index.html` and its test, `main.ts`, `launch-gate.ts`, `renderer.ts`,
  `preload.ts`, `bridge.ts`, `channels.ts`, `app-window.ts`
- Build: `vite.build-version.ts`, `vite.changelog.ts` and their tests at the
  repository root, declared in `forge.env.d.ts`
- What's new: `whats-new.ts` (in `src/shared/app/`), `whats-new-store.ts`,
  `whats-new-view.ts`
- Font loaded before the first pane: `font-preload.ts`
- Pages and projects: `page.ts`, `page-reconcile.ts`, `page-sync.ts`,
  `projects.ts`, `picker.ts`, `close-project.ts` (asks main's project.close),
  `close-refusal.ts` (in `src/shared/panes/`), `chrome-bars.ts`, `status.ts`
- Restore: `session.ts`, `session-store.ts`
- Atomic write, and a write skipped when the bytes match (`replaceFileIfChanged`): `replace-file.ts`
- Whether a socket is listening (the nvim server, the `dashboard` command finding the app): `can-connect.ts`
- Project files: `dashboard-folder.ts`, `project-files-ipc.ts`, `git.ts`, `default-branch.ts` (which branch on a remote is its default, for the ship and `/create-task` alike)
- Log: `log-entry.ts`, `log-ipc.ts`, `log-store.ts`
- Shared helpers: `overlay.ts`, `carried-edit.ts`, `newest-read.ts`,
  `clamp-index.ts`, `fuzzy.ts`, `is-record.ts`, `base-name.ts`, `slug.ts`, `age.ts`,
  `stale.ts`, `theme.ts`, `icons.ts`
- Styles: `index.css`, `app.css`, `chrome.css`, `dialogs.css`

## One app at a time

The app takes Electron's single-instance lock in `launch-gate.ts`, which
`main.ts` imports before anything else. A second launch on the same userData
folder exits before it opens a socket or writes a file, and the running app
brings its window to the front (restoring it if minimized) and reads the second
launch's command line the way it read its own (app-decision-1). Today that is
`--remote` only.

The lock is keyed on the userData folder, so a copy started with its own
`--user-data-dir` runs beside the installed app. `settings.json` and `.env` are
not in userData, so such a copy also needs a `HOME` and `XDG_CONFIG_HOME` of
its own to stay off the app you are using; `scripts/performance/launch-demo.sh`
sets all three. Without `--user-data-dir`, `pnpm start` while the installed app
is running only focuses the installed app's window, and says so on stderr.

`session.json` and `recents.json` are written through `replaceFile`
(`replace-file.ts`), a temporary file flushed to disk and renamed over the old
one, so a crash or a power cut mid-write leaves the old file or the new one,
never half of one. The temporary file has a new name on every write, so two
writers never share one. The flush runs on main's thread: on a busy disk a save
can hold main for a moment, chosen over losing the file. A `mode`, when given,
is set with `fchmod` on the temporary file before the rename, so the file never
appears under its name without it and the umask cannot narrow it.

## Dependency holds

`package.json` cannot carry a comment, so each deliberate hold is recorded here
with its reason and the condition that lifts it.

- `electron`, `@anthropic-ai/claude-agent-sdk`, `marked`, `highlight.js` and
  `yaml` stay on exact versions. Each is bumped by hand after reading its
  changelog: the chat code reaches SDK methods its types leave out
  (`cancelAsyncMessage`, `askSideQuestion`), so a caret range would let a
  release that drops them in with tests still green.
- `@xterm/xterm` stays on 6.0.0 exactly: `src/renderer/panes/paused-selection.ts`
  reaches its private render service. A bump checks those fields still exist
  and reruns `measure.mjs streams` (docs/performance/), since a rename turns the
  patch off silently and hidden projects go back to drawing every line.
  The hold and `paused-selection.ts` both go once
  `RenderService.handleSelectionChanged` checks `_isPaused` upstream.
- `typescript` is an alias to `@typescript/typescript6`, so typescript-eslint
  keeps the 6.0 API while `@typescript/native` (7.x) runs `tsc`. The alias goes
  when typescript-eslint supports TypeScript 7.
- `@types/node` follows the Node major that Electron ships (Node 24 for
  Electron 45), so code cannot type-check against a Node API the app's runtime
  lacks.
- The `undici@6` and `undici@7` overrides go when node-gyp and @electron/get
  ship the patched releases themselves.
- The `minimatch@10` override to 11 goes when its consumers (eslint,
  @eslint/config-array, typescript-estree, glob, @electron/asar) move to 11.
  Version 11 removed `makeRe`, `AST` and `Minimatch#matchOne`; before any bump
  of those consumers, check that none of them calls one.

## Content-Security-Policy

`index.html` carries the window's policy as a `<meta>` tag. Replies, and docs
from a cloned repository, are drawn as `innerHTML`; the markdown renderer
escapes raw HTML, and the policy is the line behind it. Without one, a
renderer bug that let markup through (a highlight.js grammar emitting raw
HTML, say) would run the reply's script with the preload bridge in reach,
which can type into any pane.

No inline script, no inline handlers, no `eval` and nothing from the
network runs (`script-src 'self'`, no `'unsafe-inline'`, no `'unsafe-eval'`).
That is not "only the bundle": the packaged app loads the page with
`loadFile`, and on a `file:` page Chromium matches `'self'` by scheme, so any
`file:` URL on the disk counts as self, for scripts and images alike.
Everything else allowed is there because a feature needs it:

| Directive | Needed by | Without it |
|---|---|---|
| `style-src 'unsafe-inline'` | xterm and every view set `style` and add `<style>` | Views and panes draw unstyled |
| `img-src data:` | Images in a reply or a doc, carried inline (`safeImage`) | Images show broken |
| `font-src data:` | The build inlines the smaller font files as `data:` URLs | Those font files are refused |
| `connect-src data:` | A PDF tile turns its base64 into a Blob with `fetch` | The PDF tile opens nothing |
| `frame-src blob:` | The PDF viewer is an iframe on that Blob's URL | The PDF viewer opens blank |

`object-src 'none'`, `base-uri 'none'` and `form-action 'none'` close what
`default-src` does not cover. The PDF viewer still draws under
`object-src 'none'`: Chromium's viewer is not an `<object>` of the page.

A feature that loads something new (a remote image, a worker, a WebSocket)
adds its directive to `index.html` and a row to this table in the same
change. A violation is silent in the app: open DevTools and look for
`Refused to` in the console. `index.html.test.ts` fails if `script-src` or
`object-src` widens, `img-src` lets in the network (the path `safeImage`
guards against a reply sending a secret out), or the PDF viewer's two
directives go.

## Scenarios

- Given three projects open, when the app restarts, then they come back in the order you cycled them, each on the view it was left on.
- Given a shell is running a task, when you close the window, then the app asks before it closes.
- Given the picker is open, when you type part of a folder's name, then the list narrows to the folders whose letters appear in that order.
- Given the picker is open, when you type a path starting with `/`, `\`, `~` or a drive letter, then a row opens that folder, on a remote screen too, where `~` is the host's home; it comes after the recents when one of their paths contains it, so Enter on `/api` opens `/code/api`, and is the first row otherwise, so Enter on a new folder that only loosely matches a recent opens what was typed.
- Given a typed path that is not a folder, when you press Enter on its row, then the project is not opened and the status bar says `No folder at` the path.
- Given a pane in a project is running a program, when you close the project, then it refuses and the status bar names the pane.
- Given the app is running, when it is launched again, then no second window opens and the running window comes to the front.
- Given the app is running, when it is launched again with `--user-data-dir` on another folder, then that copy runs on its own.
- Given the app is killed while it writes `session.json`, when it next launches, then it opens the projects of the last whole write.
- Given a reply carries markup that gets past the markdown renderer, when it is drawn, then no script in it runs.
- Given a build merged two pull requests since the one the app last ran, when it launches, then what's new lists those two and nothing older.
- Given the same build launches again, when the window opens, then what's new does not come up.
- Given a fresh userData folder, when the app first launches, then what's new does not come up and the build is remembered.
- Given what's new is open, when you press Enter on a row, then its pull request opens in the browser and the list stays up.

## Open questions

- `main.ts` is at the 600-line ceiling, at 599 code lines, and `renderer.ts` is
  at 583, after the pane listeners moved into `pane-output-wiring.ts`, the
  board's file listener into `board-wiring.ts` and the notes' into
  `notes-wiring.ts`. A feature that adds code to `main.ts` or `renderer.ts`
  needs a seam split out first (workflow-decision-1); the next one in
  `renderer.ts` is the session save and restore.
