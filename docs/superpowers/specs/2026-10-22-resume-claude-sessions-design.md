# Resume each pane's Claude session after a restart

Card: 7eee4121 "Resume each pane's Claude session after a restart".

## Problem

Restarting the app kills every pane. `session.json` brings back the projects, their views, the focused
pane and the typed pane names, and five empty shells. Every Claude Code conversation that was running
in a pane has to be found again by hand.

`claude --continue` does not answer it: it opens the most recent conversation in the current folder, so
two Claude panes on one checkout both come back as the same conversation and the other is lost to the
`claude --resume` picker.

## Outcome

Quit the app with Claude running in terminal 2 and terminal 4 of a project. Launch it again: terminal 2
and terminal 4 each start their own shell in the folder their conversation ran in, with
`claude --resume <that session's id>` already typed and running. The other panes are empty shells as
today. Exiting the resumed Claude leaves an ordinary shell prompt in the pane.

Resuming is automatic, on every launch, for every pane that had Claude running when the app last
quit (or, after a crash, at the last sweep before it).

## What already exists

- `usage-sweep.ts` runs every 30 seconds. It reads `~/.claude/sessions/<pid>.json` through
  `liveSessions` (`usage-store.ts`) and places each live session on its pane through `sessionsByPane`
  (`pane-sessions.ts`), by walking the process tree from the session's pid up to a pane's shell pid.
- Each of those files also carries `cwd`, the folder the session was started in. `claude --resume <id>`
  looks the session up under the folder it is run in, so a session started in a worktree pane has to be
  resumed from that worktree.
- `paneIsBusy` (`pane-reading.ts`) reads a pane whose foreground program is not its shell as busy, so a
  resumed Claude is never a pane a ship or the command screen takes.

## Design

### 1. Knowing which session each pane runs

`liveSessions` also returns the session file's `cwd` as `directory`. `sessionsByPane` hands back the
whole record per pane rather than only the id, so one walk answers both the token figures and this.

The sweep gains one port, `placed(byPane)`, called after every run with pane id to
`{ session, directory }`. Main keeps the latest map.

The same reading can be taken on demand (`ps` plus the sessions folder plus the walk), so the Quit
confirmation can take a fresh one. Both go through one function so the sweep and the quit cannot place
a session differently.

### 2. Storing it

Each page in `session.json` gains `claude: (PaneConversation | null)[]`, one entry per grid pane like
`names`, where `PaneConversation` is `{ session: string; directory: string }`. `parseSession` keeps an
entry only when the directory is a non-empty string and the session id is a UUID, since the id is
typed into a shell and anything else in a hand-edited file would be a command run in the pane. Anything
else drops to `null`; a file written before the field existed reads as all `null`.

Main becomes the only writer of `session.json`. The renderer keeps sending the layout on
`session:write` exactly as now; main remembers the last layout it was sent and writes it with the
`claude` slots filled in from its map, translating a pane id to its project path and pane index. That
merge happens:

- on every `session:write` from the renderer;
- after a sweep whose map differs from the last one written, so a crash loses at most 30 seconds;
- when Quit is confirmed, with a fresh reading taken before the window is destroyed. Without it,
  `/clear` followed by Quit within 30 seconds would resume the conversation from before the `/clear`.

The layout half is untouched, so the renderer's own reasons for when to save still hold.

### 3. Restoring it

Main reads the saved slots once at startup and holds them as pending, keyed by project path and pane
index. When `spawnProject` spawns a pane that has a pending slot, it takes the slot (so reopening the
project later in the same run does not resume again) and:

- when the slot's directory exists: points the pane's `terminalCommands` entry at that directory,
  spawns the shell there, and writes `claude --resume <id>\r` into it;
- when it does not (a worktree removed while the app was closed): spawns the plain shell at the project
  path and resumes nothing. Resuming from the wrong folder would only print "No conversation found".

The command is typed into an ordinary shell rather than run as the pane's process, so exiting Claude
returns to a prompt and the pane is never dead.

A session whose folder is a card's recorded worktree was that card's agent, and comes back as it: the
pane is started the way a ship starts one (`exec claude --resume <id>`) and the worktree record names
the pane again. That holds only for a conversation in a pane of the card's own project, matched to the
worktree by real path, and only for the first such pane: every record loses its pane at launch, so a
second Claude in the same worktree finds the card taken and comes back typed into a shell. This rule is
`agentToResume` in `claude-resume.ts`. Without that the status bar would not print the branch, the card could be shipped a
second time into the same worktree, and the review sweep would start beside the resumed agent.

### 4. The first half minute after a launch

A resumed Claude takes a moment to write its session file, and the first sweep runs three seconds after
launch. Read naively, the layout write that follows the restore, or a first sweep that runs before
Claude has written its file, would save every pane as `null`, and a crash in that window would lose all
of them.

So a pane that was resumed keeps its restored conversation until a reading taken at least 30 seconds
after that pane itself was resumed. Each pane's grace is its own: a project opened late in the run must
not put back the launch's panes, whose Claudes may have been exited since. Taken, not arrived: the first sweep reads every log on the
machine and can finish late, and what it saw is as old as the moment it looked. A reading older than
the latest one is ignored, so a sweep that looked before Quit cannot overwrite Quit's reading. A
reading with no process tree (`ps` missing or timed out) is no reading, and nothing is written for it. Before that, a pane's conversation is the live reading when there is one
and the restored one when there is not; from then on it is the live reading alone, so a Claude you exit after
the restart is not resumed next time. This rule lives in `resume-ledger.ts`, not in main.

### 5. Out of scope

- A reply cut off at Quit is not re-run. The conversation comes back; the last turn is asked again.
- Scrollback is not restored.
- Programs other than Claude Code are not restarted. That is card 7d2ec2d4.
- No key, no setting, no prompt. If automatic turns out to be wrong, that is a later card.

## Units

| File | Kind | What it holds |
|------|------|---------------|
| `src/claude-resume.ts` | decision | `PaneConversation`; pane map to per-page entries; whether to write; whether a conversation resumes (directory exists, given an `exists` function); which resumes come back as a card's agent; the line typed into the shell |
| `src/claude-resume.test.ts` | test | each rule above |
| `src/resume-ledger.ts` | decision | the pending conversations, each used up once; the per-pane launch grace; the newest reading wins |
| `src/resume-ledger.test.ts` | test | each rule above |
| `src/session.ts` | decision | `claude` on `SessionPage`, parsed and defaulted |
| `src/session.test.ts` | test | the new field: missing, malformed, valid |
| `src/session-store.ts` | main wiring | the session file and the last layout; `session:read` and `session:write`; the three write moments |
| `src/project-files-ipc.ts` | main wiring | `board:peek`, `board:read`, `board:write`, `notes:read`, `notes:write`, moved verbatim out of `main.ts` |
| `src/usage-store.ts`, `src/pane-sessions.ts`, `src/usage-sweep.ts` | existing | `cwd` read, record returned per pane, `placed` port |
| `src/help.ts` | existing | the blurb that says what a restart brings back |
| `package.json` | existing | minor version bump |

`main.ts` sits at 595 code lines against the 600 ceiling, so the board and notes handlers move out
first, as their own commit, before anything is added. `renderer.ts` (600) is not touched.

## Testing

`npm test`, `npx tsc --noEmit`, `npx eslint .`. The decisions are covered by their test files. The
spawn and the typed command are main wiring and are checked by hand in the app: open a project, start
`claude` in two panes and send a message in each, quit, relaunch, and see both conversations back in
their own panes; repeat with one of them in a worktree, and with that worktree removed while the app is
closed.
