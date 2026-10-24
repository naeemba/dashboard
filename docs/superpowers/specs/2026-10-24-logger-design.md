# Logger and a log section in the manager

Card: `7dbfc844-78a3-4661-9b7b-a855fe3eefe3`. One pull request.

A failure today is one line in the status bar's error span, gone at the next
message, and nothing records what the app did. The log keeps both: what went
wrong, and what happened (a pane exited, a card moved, a ship made a
worktree). It is read in a fifth section of the manager.

## 1. The file

- JSON lines, one entry per line, in `app.getPath('userData')`:
  `dashboard.log`, then `dashboard.log.1` up to `dashboard.log.4`.
- Five files of 5 MB each, 25 MB at most. When an append would take
  `dashboard.log` past 5 MB, `.4` is deleted, `.3` becomes `.4` and so on
  down, `dashboard.log` becomes `.1`, and the append starts a new file.
- An entry is

  ```ts
  type LogLevel = 'error' | 'warn' | 'info';
  type LogEntry = { time: string; level: LogLevel; kind: LogKind; project?: string; message: string };
  ```

  `time` is ISO 8601. `project` is the project path, absent for app-wide
  entries. `kind` is one of the rows in section 3.
- A line that does not parse as an entry is skipped on read, never thrown on.
  A truncated last line after a crash is the expected case.

## 2. Files and channels

- `src/log-entry.ts`, shared and pure, beside `log-entry.test.ts`: the types,
  `parseLogLine(line)` (an entry or `undefined`), `rotationNames(base, count)`
  (the rename order), `needsRotation(currentSize, appendSize, limit)`, and
  `matchesLogFilter(entry, query)`: every word of the query appears in the level, kind, project or message.
- `src/log-store.ts`, main only: `log(draft)` and `tail(count)`. Writes are
  synchronous: main is one thread, so two entries cannot interleave and no
  rotation runs twice. A write that fails is written to stderr and
  dropped: logging never takes the app down or blocks what it was logging.
  `tail` reads the newest files until it has `count` entries.
- IPC, `<noun>:<verb>`:
  - `log:write`, renderer to main, one entry without `time` (main stamps it).
  - `log:read`, renderer asks, main answers with the newest 1000 entries.
  - `log:appended`, main to renderer, each entry after it is written, so an
    open log section updates live.
- `main.ts` is past 1000 lines. It gains the import, the three handlers and
  one-line `log(...)` calls at the event sites; nothing else. If a handler
  needs more than a line it goes in `log-store.ts`.

## 3. What is logged

| kind | level | from | example |
|---|---|---|---|
| `app` | info | main | `started v1.42.0`, `quit` |
| `project` | info | renderer | `opened`, `closed` |
| `pane` | info, warn on non-zero exit | main | `terminal 3 exited (code 1)` |
| `agent` | info | main | `started in terminal 2`, `exited` |
| `card` | info | renderer | `"Fix login" Doing → Review` |
| `ship` | info, error on failure | renderer | `fix-login worktree created` |
| `worktree` | info, error on failure | main | `removed fix-login` |
| `board` | info on a `board` command write, error on unreadable or failed write | main | `board.json unreadable, kept as board.broken.json` |
| `error` | error | renderer | every message that goes through `failureText` |

`failureText` is where every error shown to a person already goes, so the
`error` row is logged there once rather than at each of its callers.

Never logged: pane output, anything typed into a pane, the command text from
the command screen, the contents of `.env` or settings. Typed text carries
tokens and passwords, and a plain file in `userData` would keep them for
months. A command-screen run is logged as `task run on 3 projects`.

## 4. The log section

- `SECTIONS` gains `{ name: 'log', mode: 'log' }` at the end, so Alt+H and
  Alt+L already reach it and the four sections before it stay where they are.
- `'log'` joins `MODES` (not `PROJECT_MODES`: no project has it), with a
  branch in `focusMode` and `modeLabel`, and a name and blurb in `src/help.ts`.
- `src/log-view.ts`: rows newest first, each `time  level  kind  project
  message`, error rows coloured. Arrow keys walk the rows; Enter, or a click,
  unfolds the row to its full message and project path, and again folds it.
  A filter box sits above the rows the way the command box sits above the
  command screen's, and takes the keyboard on arrival. Every word typed must
  appear in the row's level, kind, project or message (`error card` finds
  failed card entries), through `matchesLogFilter`. No letter key opens it: a
  bare letter bound on this screen would fire while you type in the box.
  Escape empties it. The box gets `dir = 'auto'`. The keys (arrows, Enter,
  Escape) are rows in `src/actions.ts`, scoped to `log`.
- On arrival the view asks `log:read`; while it exists, `log:appended`
  entries are added at the top. The view keeps at most 1000 rows; older ones
  are in the file. The section's heading prints the path of `dashboard.log`
  for anything further back; the manager has no editor of its own to open
  it in.
- A failed read says so through `failureText` in the status bar, and the
  section shows what it already had.

## 5. Testing

- `log-entry.test.ts`: rotation threshold at and past the limit, the rename
  order for five files, a corrupt or truncated line skipped, the filter on
  each field, on several words at once, and an empty query matching everything.
- No DOM test environment, so the view, the live update and the rotation on
  disk are checked by hand in the app: fill past 5 MB with a loop of
  `log:write`, see `.1` appear and `.4` never exceeded.

## Not doing

- The manager's `activity` panel stays as it is. Replacing it with the
  newest log lines is a later decision, once the log has run a while.
- No log levels set in settings, no export, no search across rotated files
  beyond what `tail` reads.
- Version bump: minor, a new capability.
