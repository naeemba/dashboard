# App

The window, its pages and what a restart puts back. Main owns the projects that
are open and the files under `.dashboard/`; the renderer draws one page per
project and wires every other feature into it.

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

`npx eslint .` holds the line (app-rule-2, rules in `eslint.config.mjs`): a file
in `renderer/` imports nothing from `main/` or `preload/`, one in `main/` nothing
from `renderer/` or `preload/`, one in `preload/` or `shared/` only from
`shared/`; and a package that needs Node or the DOM is a value import only on
its own side. `eslint.config.test.ts` pins each of those.

- Process and window: `main.ts`, `renderer.ts`, `preload.ts`, `bridge.ts`,
  `channels.ts`, `app-window.ts`
- Build: `vite.build-version.ts` and its test at the repository root, declared
  in `forge.env.d.ts`
- Pages and projects: `page.ts`, `page-reconcile.ts`, `page-sync.ts`,
  `projects.ts`, `picker.ts`, `close-project.ts`, `close-refusal.ts` (in `src/shared/panes/`, since
  `dashboard project close` asks it from main too), `chrome-bars.ts`, `status.ts`
- Restore: `session.ts`, `session-store.ts`
- Project files: `dashboard-folder.ts`, `project-files-ipc.ts`, `git.ts`
- Log: `log-entry.ts`, `log-ipc.ts`, `log-store.ts`
- Shared helpers: `overlay.ts`, `carried-edit.ts`, `newest-read.ts`,
  `clamp-index.ts`, `fuzzy.ts`, `is-record.ts`, `base-name.ts`, `slug.ts`, `age.ts`,
  `stale.ts`, `theme.ts`, `icons.ts`
- Styles: `index.css`, `app.css`, `chrome.css`, `dialogs.css`

## Dependency holds

`package.json` cannot carry a comment, so each deliberate hold is recorded here
with its reason and the condition that lifts it.

- `electron`, `@anthropic-ai/claude-agent-sdk`, `marked`, `highlight.js` and
  `yaml` stay on exact versions. Each is bumped by hand after reading its
  changelog: the chat code reaches SDK methods its types leave out
  (`cancelAsyncMessage`, `askSideQuestion`), so a caret range would let a
  release that drops them in with tests still green.
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

## Scenarios

- Given three projects open, when the app restarts, then they come back in the order you cycled them, each on the view it was left on.
- Given a shell is running a task, when you close the window, then the app asks before it closes.
- Given the picker is open, when you type part of a folder's name, then the list narrows to the folders whose letters appear in that order.
- Given the picker is open, when you type a path starting with `/` or `~`, then its first row opens that folder, on a remote screen too, where `~` is the host's home.
- Given a typed path that is not a folder, when you press Enter on its row, then the project is not opened and the status bar says `No folder at` the path.
- Given a pane in a project is running a program, when you close the project, then it refuses and the status bar names the pane.

## Open questions

- Neither entry file is at the 600-line ceiling: `main.ts` is at 572 code lines, and `renderer.ts` is
  at 566 since the close flow moved into `close-project.ts` and the which-key
  strip's tracking into `which-key-tracking.ts`. A feature that would push
  either past 600 needs a seam split out first (workflow-decision-1).
