# App: hard rules

The one-line rule is in `CLAUDE.md`; this is what breaking it looked like.

## app-rule-1: IPC channels are `<noun>:<verb>`

The thing first, then what you do to it: `link:open`, `session:write`,
`board:read`, `pty:resize`, `notification:show`. Every channel in
`src/preload/preload.ts` follows it.

`notify:show` did not — two verbs, nothing named. Grep for the channels that
touch notifications and it does not sort next to them, so the next person adds
`alert:send` and now there are three spellings of one idea.

`chat:commands` and `chat:sessions` did not either — two nouns, the verb
missing — and the next channel copied them as `chat:models`. They are
`chat-commands:read` and `chat-sessions:read` now, beside `chat-models:read`:
a list the page asks for is the list's name, then `read`.

## app-rule-2: Imports stay on their process's side

`src/main/` runs in Node, `src/renderer/` in the window, `src/preload/` in the
window with only `electron`, `src/shared/` in both. The rules in
`eslint.config.mjs` fail an import that crosses that line: the renderer
importing main or the preload, main importing the renderer or the preload, the
preload or shared importing anything but shared, a value import of a Node
package (`nodeOnly` in that file, or a builtin with or without `node:`) in the
renderer or shared, a Node package other than `electron` in the preload, and a
DOM package (`domOnly`) outside the renderer. A new dependency that needs one
side goes in its list. A type import of a package is
erased at build and passes; any import of another process's file does not, a
type one included, because the type belongs in `src/shared/`. Static imports,
`import()` and `import('...')` types are all checked, and
`eslint.config.test.ts` fails the day one of those stops matching.

Before the rule, nothing stopped it. A `node:fs` import in a view type-checks,
since one tsconfig shows both Node and DOM types everywhere, and the window
has no Node to give it: the first to notice is the build or the running app,
not `tsc` or the tests, which run in Node. The
type imports were quieter: when `src/` split by process, 58 imports read
`renderer/... -> ../../main/...`, mostly `Project` and `WorktreeEntry` taken
from files that do `fs` work, one value import away from pulling that work
into the window.

`@xterm/addon-serialize` counts as Node on purpose: main runs it over
`@xterm/headless` to copy a pane's screen (`pane-screen-copy.ts`).
