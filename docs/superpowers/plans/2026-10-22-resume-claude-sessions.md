# Resume Claude Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every pane that had Claude Code running when the app quit comes back on the next launch with `claude --resume <its session id>` typed into a shell in the folder that session ran in.

**Architecture:** The token sweep already places each live session on its pane; it now also carries the session's `cwd` and hands the map to a new main-side session store. The store is the only writer of `session.json`: it merges the renderer's layout with one Claude slot per pane, and at launch hands each pane's saved slot to `spawnProject`, which types the resume line into the new shell. Decisions live in `claude-resume.ts` and `session.ts`, both tested; the rest is main wiring.

**Tech Stack:** Electron main process, node-pty, TypeScript, vitest (node environment only).

**Spec:** `docs/superpowers/specs/2026-10-22-resume-claude-sessions-design.md`

## Global Constraints

- `src/main.ts` must stay at or under 600 code lines (comments and blank lines do not count). Count: `grep -v '^\s*$' src/main.ts | grep -v '^\s*//' | wc -l`.
- `src/renderer.ts` is at 600 and is not edited.
- No abbreviations in identifiers (`configuration` not `config`, `message` not `msg`); `id`, `url`, `json` are fine.
- IPC channels are `<noun>:<verb>`; no new channel is added.
- Never quit, kill, restart or replace the running Dashboard app. Building into `out/` or `.vite/` is fine.
- Comments in the codebase's style: full prose sentences explaining why, no mention of any AI tool.
- Every merged card bumps `package.json` `version`: this is a capability, `1.14.0` to `1.15.0`.
- Checks: `npm test`, `npx tsc --noEmit`, `npx eslint .` all pass at the end of every task.

## Review Focus

1. A `session.json` slot whose session id is not a UUID (hand-edited, corrupted, or `x; rm -rf ~`) is typed into a shell. Expected: it is dropped on parse and never typed. Pinned in Task 2 (`isClaudeSlot`).
2. A crash in the first 30 seconds after a launch, before the first sweep sees the resumed Claudes. Expected: the next launch still resumes them. Pinned in Task 2 (`heldSlots` within grace).
3. A Claude exited after a restart, then a quit a minute later. Expected: not resumed next time. Pinned in Task 2 (`heldSlots` after grace).
4. A worktree removed while the app was closed. Expected: plain shell at the project path, nothing typed. Pinned in Task 2 (`resumable`).
5. A layout page for a project that is in the layout but has no open slot. Expected: written with an empty `claude` list, not a crash. Pinned in Task 2 (`withClaude`).

---

### Task 1: Move the board and notes IPC out of main.ts

`main.ts` is at 595 code lines. This makes room before anything is added. Behaviour does not change.

**Files:**
- Create: `src/project-files-ipc.ts`
- Modify: `src/main.ts` (imports at lines 24-25; handlers at lines 663-691)

**Interfaces:**
- Produces: `registerProjectFiles(boards: BoardWatchers): void`

- [ ] **Step 1: Create `src/project-files-ipc.ts`** with the five handlers moved verbatim, comments included:

```typescript
import { ipcMain } from 'electron';
import type { Board } from './board';
import { openBoard, peekBoard, writeBoard } from './board-store';
import type { BoardWatchers } from './board-watch';
import { readNotes, writeNotes } from './notes-store';

// The two files a project keeps in its .dashboard folder, read and written for the renderer. Main-process
// wiring only, out of main.ts because main had reached its 600-line ceiling; what a board or a page of
// notes is, and how either is read and written, is board-store.ts's and notes-store.ts's. Main hands over
// the one thing only it holds, the watchers that tell the renderer about a write from somewhere else.
export function registerProjectFiles(boards: BoardWatchers): void {
  // Reading also seeds the folder, so the first Ctrl+B on a project is what creates .dashboard. Seeding
  // is a convenience — writing the two explanation files — so a read-only project folder must not cost
  // the user a board.json that is sitting right there and perfectly readable.
  ipcMain.handle('board:peek', (_event, projectPath: string) => peekBoard(projectPath));
  ipcMain.handle('board:read', (_event, projectPath: string) => {
    try {
      return openBoard(projectPath);
    } finally {
      // After the read, which is what creates .dashboard on a project that has never had a board — and
      // in a finally, because a read that throws still leaves a folder worth watching. Skip it there and
      // that board never notices the command line again for as long as you stay on the screen.
      boards.watch(projectPath);
    }
  });
  // invoke, not send, so a write that fails rejects in the renderer and reaches the status bar.
  // The bytes are kept so the watcher can tell this write from somebody else's. Nothing is returned to
  // the renderer: it already has the board it just sent.
  ipcMain.handle('board:write', (_event, projectPath: string, board: Board) => {
    boards.wrote(projectPath, writeBoard(projectPath, board));
  });

  // The project's page of notes. No watcher and no seeding: the notes are one box one person types
  // into, and a project that has never had any has no file until the first keystroke lands.
  ipcMain.handle('notes:read', (_event, projectPath: string) => readNotes(projectPath));
  // invoke, not send, for the same reason board:write is: a write that fails rejects in the renderer
  // and reaches the status bar, rather than leaving a page on screen that is not on disk.
  ipcMain.handle('notes:write', (_event, projectPath: string, text: string) => {
    writeNotes(projectPath, text);
  });
}
```

- [ ] **Step 2: Edit `src/main.ts`.** Delete the block from `// Reading also seeds the folder, so the first Ctrl+B` through the closing `});` of `notes:write`, and put in its place:

```typescript
registerProjectFiles(boards);
```

Change the imports:

```typescript
import { BOARD_FILE_PATH, readBoard, writeBoard } from './board-store';
```

delete `import { readNotes, writeNotes } from './notes-store';`, change `import { moveCardById, shipColumnIndex, type Board } from './board';` to `import { moveCardById, shipColumnIndex } from './board';`, and add beside the `pane-openers` import:

```typescript
import { registerProjectFiles } from './project-files-ipc';
```

- [ ] **Step 3: Run the checks**

Run: `npx tsc --noEmit && npx eslint . && npm test`
Expected: all pass. Then `grep -v '^\s*$' src/main.ts | grep -v '^\s*//' | wc -l` prints about 583.

- [ ] **Step 4: Commit**

```bash
git add src/project-files-ipc.ts src/main.ts
git commit -m "Move the board and notes handlers out of main.ts to make room under the ceiling"
```

---

### Task 2: The resume decisions and the saved slots

**Files:**
- Create: `src/claude-resume.ts`, `src/claude-resume.test.ts`
- Modify: `src/session.ts`, `src/session.test.ts`

**Interfaces:**
- Produces, from `src/claude-resume.ts`:
  - `type ClaudeSlot = { session: string; directory: string }`
  - `RESUME_GRACE_MS = 30_000`
  - `isClaudeSlot(value: unknown): value is ClaudeSlot`
  - `heldSlots(live: ReadonlyMap<string, ClaudeSlot>, resumed: ReadonlyMap<string, ClaudeSlot>, sinceLaunch: number): ReadonlyMap<string, ClaudeSlot>`
  - `withClaude(layout: Session, slotOf: (projectPath: string) => number, held: ReadonlyMap<string, ClaudeSlot>): SavedSession`
  - `resumable(slot: ClaudeSlot | null | undefined, exists: (directory: string) => boolean): slot is ClaudeSlot`
  - `resumeLine(slot: ClaudeSlot): string`
- Produces, from `src/session.ts`: `type SavedPage = SessionPage & { claude: (ClaudeSlot | null)[] }`, `type SavedSession = { pages: SavedPage[]; activeIndex: number }`; `parseSession` and `readSession` return `SavedSession`; `writeSession(file: string, session: SavedSession)`. `Session` and `SessionPage` are unchanged and stay what the renderer sends.

- [ ] **Step 1: Write the failing tests** in `src/claude-resume.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  RESUME_GRACE_MS, heldSlots, isClaudeSlot, resumable, resumeLine, withClaude, type ClaudeSlot,
} from './claude-resume';

const ID = 'ccaaf965-c864-48db-8044-30bf27d93087';
const OTHER = '4a8480d2-4e1d-4dca-8cac-f7a8e29548a3';
const slot = (session: string, directory = '/work/api'): ClaudeSlot => ({ session, directory });

describe('isClaudeSlot', () => {
  it('keeps a session id and the folder it ran in', () => {
    expect(isClaudeSlot(slot(ID))).toBe(true);
  });

  // The id is typed into a shell, so anything but a UUID is a command waiting to run.
  it('refuses an id that is not a UUID', () => {
    expect(isClaudeSlot(slot(`${ID}; rm -rf ~`))).toBe(false);
    expect(isClaudeSlot(slot('a'))).toBe(false);
  });

  it('refuses a slot with no folder, or no slot at all', () => {
    expect(isClaudeSlot(slot(ID, ''))).toBe(false);
    expect(isClaudeSlot({ session: ID })).toBe(false);
    expect(isClaudeSlot(null)).toBe(false);
    expect(isClaudeSlot(7)).toBe(false);
  });
});

describe('heldSlots', () => {
  const resumed = new Map([['0:1', slot(ID)], ['0:3', slot(OTHER)]]);

  // A resumed Claude has not written its session file yet when the first sweep runs, and a crash then
  // must not cost the next launch every pane.
  it('keeps a resumed pane until the grace runs out, with a live reading winning', () => {
    const live = new Map([['0:3', slot(ID, '/work/api-tree')]]);
    expect(heldSlots(live, resumed, RESUME_GRACE_MS - 1))
      .toEqual(new Map([['0:1', slot(ID)], ['0:3', slot(ID, '/work/api-tree')]]));
  });

  // A Claude exited after the restart must not come back on the launch after.
  it('answers with the live reading alone once the grace is over', () => {
    const live = new Map([['0:3', slot(OTHER)]]);
    expect(heldSlots(live, resumed, RESUME_GRACE_MS)).toEqual(live);
  });
});

describe('withClaude', () => {
  const layout = {
    activeIndex: 1,
    pages: [
      { path: '/work/api', mode: 'terminals' as const, focused: 0, names: [] },
      { path: '/work/web', mode: 'board' as const, focused: 2, names: ['dev'] },
    ],
  };
  const slotOf = (projectPath: string): number => ({ '/work/api': 0, '/work/web': 2 })[projectPath] ?? -1;

  it('puts each pane\'s session on its page by slot, one entry per grid pane', () => {
    const held = new Map([['0:1', slot(ID)], ['2:4', slot(OTHER, '/work/web')]]);
    expect(withClaude(layout, slotOf, held)).toEqual({
      activeIndex: 1,
      pages: [
        { ...layout.pages[0], claude: [null, slot(ID), null, null, null] },
        { ...layout.pages[1], claude: [null, null, null, null, slot(OTHER, '/work/web')] },
      ],
    });
  });

  // The live reading carries the pid; only the two fields a resume needs are written.
  it('writes only the session and the folder', () => {
    const held = new Map([['0:0', { pid: 900, ...slot(ID) }]]);
    expect(withClaude(layout, slotOf, held).pages[0].claude[0]).toEqual(slot(ID));
  });

  it('gives a page whose project has no slot no sessions rather than throwing', () => {
    expect(withClaude(layout, () => -1, new Map()).pages[0].claude).toEqual([]);
  });
});

describe('resumable', () => {
  it('resumes only a slot whose folder is still there', () => {
    expect(resumable(slot(ID), () => true)).toBe(true);
    expect(resumable(slot(ID), () => false)).toBe(false);
    expect(resumable(null, () => true)).toBe(false);
    expect(resumable(undefined, () => true)).toBe(false);
  });
});

describe('resumeLine', () => {
  it('types the resume and presses Enter', () => {
    expect(resumeLine(slot(ID))).toBe(`claude --resume ${ID}\r`);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/claude-resume.test.ts`
Expected: FAIL, `Failed to resolve import "./claude-resume"`.

- [ ] **Step 3: Write `src/claude-resume.ts`**

```typescript
import type { SavedSession, Session } from './session';
import { TERMINAL_COUNT, terminalId } from './terminals';

// Which Claude Code conversation each pane was running, and how a launch gets it back.
//
// The token sweep places every live session on its pane; this turns that into what session.json keeps
// per pane, and back into the line typed into a pane's new shell. A session is resumed from the folder
// it ran in because `claude --resume <id>` looks the id up under the folder it is run from: a session
// started in a worktree pane is not found from the project's own checkout.
export type ClaudeSlot = { session: string; directory: string };

// How long after a launch a resumed pane keeps its saved session without a live reading behind it. A
// resumed Claude takes a moment to write ~/.claude/sessions/<pid>.json and the first sweep runs three
// seconds in, so without this the first write after a launch would save every pane as empty and a crash
// then would lose all of them. A sweep runs every 30 seconds, so the first one past this has seen them.
export const RESUME_GRACE_MS = 30_000;

// The id is typed into a shell, so it is held to the shape Claude Code gives it. Anything else in a
// hand-edited or damaged file would be a command run in the pane.
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isClaudeSlot(value: unknown): value is ClaudeSlot {
  const { session, directory } = (value ?? {}) as { session?: unknown; directory?: unknown };
  return typeof session === 'string' && SESSION_ID.test(session)
    && typeof directory === 'string' && directory !== '';
}

// What each pane counts as running, by terminal id. Inside the grace a pane that was resumed keeps its
// saved slot unless a live reading says otherwise; after it, only the live reading counts, so a Claude
// you exited after the restart does not come back on the launch after.
export function heldSlots(
  live: ReadonlyMap<string, ClaudeSlot>,
  resumed: ReadonlyMap<string, ClaudeSlot>,
  sinceLaunch: number,
): ReadonlyMap<string, ClaudeSlot> {
  return sinceLaunch >= RESUME_GRACE_MS ? live : new Map([...resumed, ...live]);
}

// The renderer's layout with each page's panes filled in. A page is matched to its slot by path, the
// way the restore matches them, and a page with no open slot gets no sessions rather than another
// project's. Only the two fields a resume needs are copied: the live reading carries the pid as well.
export function withClaude(
  layout: Session,
  slotOf: (projectPath: string) => number,
  held: ReadonlyMap<string, ClaudeSlot>,
): SavedSession {
  return {
    ...layout,
    pages: layout.pages.map((page) => {
      const slot = slotOf(page.path);
      if (slot === -1) return { ...page, claude: [] };
      const claude = Array.from({ length: TERMINAL_COUNT }, (_value, index) => {
        const found = held.get(terminalId(slot, index));
        return found === undefined ? null : { session: found.session, directory: found.directory };
      });
      return { ...page, claude };
    }),
  };
}

// A slot is resumed only from a folder that is still there. A worktree removed while the app was closed
// would only print "No conversation found", so that pane gets the plain shell at the project instead.
export function resumable(
  slot: ClaudeSlot | null | undefined,
  exists: (directory: string) => boolean,
): slot is ClaudeSlot {
  return slot !== null && slot !== undefined && exists(slot.directory);
}

// Typed into the pane's own shell rather than run as the pane's process, so exiting Claude leaves a
// prompt instead of a dead pane.
export function resumeLine(slot: ClaudeSlot): string {
  return `claude --resume ${slot.session}\r`;
}
```

- [ ] **Step 4: Add the field to `src/session.ts`.** Add the import:

```typescript
import { isClaudeSlot, type ClaudeSlot } from './claude-resume';
```

After the `Session` type, add:

```typescript
// What is on disk: the layout the renderer sends, plus which Claude Code conversation each grid pane was
// running, one slot per pane like `names`. Main fills these in; the renderer never sees them change.
// claude-resume.ts holds why each slot carries its folder.
export type SavedPage = SessionPage & { claude: (ClaudeSlot | null)[] };
export type SavedSession = { pages: SavedPage[]; activeIndex: number };
```

Change `const EMPTY: Session` to `const EMPTY: SavedSession`; `function toSessionPage(stored: unknown): SessionPage | null` to return `SavedPage | null`; destructure `claude` as well (`const { path, mode, focused, names, claude } = (stored ?? {}) as { path?: unknown; mode?: unknown; focused?: unknown; names?: unknown; claude?: unknown };`), and add as the last field of the returned object:

```typescript
    // A slot that is not a whole one is no session at all, never half of one: its id is typed into a
    // shell. A file written before the field existed resumes nothing.
    claude: (Array.isArray(claude) ? claude : []).map((slot) => (isClaudeSlot(slot) ? slot : null)),
```

Change `parseSession(stored: unknown): Session` and `readSession(file: string): Session` to return `SavedSession`, and `writeSession(file: string, session: Session)` to take `session: SavedSession`. Update the header comment's second sentence: "Not the shells themselves — those die with the app, and every pane comes back empty at its project's directory, and what each pane was called, except a pane that was running Claude Code, which resumes that conversation."

- [ ] **Step 5: Update `src/session.test.ts`.** In `keeps a saved layout as it was written`, the expected page becomes `{ path: '/Users/sharp/work/api', mode: 'board', focused: 3, names: [], claude: [] }`; in `drops a page with no usable path and keeps the others`, `{ path: page.path, mode: 'board', focused: 3, names: [], claude: [] }`. Add before the last test:

```typescript
  // A slot's id is typed into a shell on launch, so a slot that is not whole is no slot.
  it('keeps each pane\'s Claude session and drops a slot that is not one', () => {
    const resume = { session: 'ccaaf965-c864-48db-8044-30bf27d93087', directory: '/Users/sharp/work/api' };
    const stored = { pages: [{ ...page, claude: [resume, null, { session: 'x; rm -rf ~', directory: '/' }, 7] }] };
    expect(parseSession(stored).pages[0].claude).toEqual([resume, null, null, null]);
  });

  it('resumes nothing from a file written before sessions were kept', () => {
    expect(parseSession({ pages: [page] }).pages[0].claude).toEqual([]);
    expect(parseSession({ pages: [{ ...page, claude: 'abc' }] }).pages[0].claude).toEqual([]);
  });
```

- [ ] **Step 6: Keep main compiling.** `writeSession` now takes a `SavedSession`, and `main.ts`'s `session:write` handler hands it the renderer's `Session`. Until Task 4 replaces that handler, change it to:

```typescript
ipcMain.on('session:write', (_event, session: Session) => writeSession(sessionFile, { ...session, pages: session.pages.map((entry) => ({ ...entry, claude: [] })) }));
```

- [ ] **Step 7: Run the checks**

Run: `npm test && npx tsc --noEmit && npx eslint .`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/claude-resume.ts src/claude-resume.test.ts src/session.ts src/session.test.ts src/main.ts
git commit -m "Keep which Claude session each pane runs in the saved session"
```

---

### Task 3: The sweep carries each session's folder and reports where every session is

**Files:**
- Modify: `src/usage-store.ts:176-198`, `src/usage-store.test.ts:110-154`
- Modify: `src/pane-sessions.ts:50-67`, `src/pane-sessions.test.ts`
- Modify: `src/usage-sweep.ts`

**Interfaces:**
- Consumes: nothing from Tasks 1-2.
- Produces:
  - `type LiveSession = { pid: number; session: string; directory: string }` from `src/usage-store.ts`
  - `sessionsByPane<Live extends { pid: number }>(parents, panes, sessions: readonly Live[]): Map<string, Live>`
  - `UsageSweepPorts.placed(byPane: ReadonlyMap<string, LiveSession>): void`
  - `UsageSweep.placeNow(): Promise<Map<string, LiveSession>>`

- [ ] **Step 1: Update the tests first.** In `src/usage-store.test.ts`, every expected record gains `directory: ''` (`{ pid: 900, session: 'a', directory: '' }`, `{ pid: 901, session: 'b', directory: '' }`), and add:

```typescript
  it('reads the folder the session was started in', async () => {
    const directory = await sessionsDirectory({
      '900.json': JSON.stringify({ pid: 900, sessionId: 'a', cwd: '/work/api' }),
    });
    expect(await liveSessions(directory)).toEqual([{ pid: 900, session: 'a', directory: '/work/api' }]);
  });
```

In `src/pane-sessions.test.ts`, `places the live sessions and drops the ones with no pane` expects the whole records back:

```typescript
  it('places the live sessions and drops the ones with no pane', () => {
    const a = { pid: 3690, session: 'a' };
    const b = { pid: 84623, session: 'b' };
    expect(sessionsByPane(parentProcesses(PS), PANES, [a, { pid: 999, session: 'elsewhere' }, b]))
      .toEqual(new Map([['1:2', a], ['1:4', b]]));
  });
```

Any other `sessionsByPane` expectation in that file changes the same way: the map's values are the records passed in, not their `session` strings.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/usage-store.test.ts src/pane-sessions.test.ts`
Expected: FAIL on the `directory` field and on the map values.

- [ ] **Step 3: `src/usage-store.ts`.** Above `liveSessions`:

```typescript
// One running Claude Code, as its ~/.claude/sessions/<pid>.json says: the process, the conversation, and
// the folder it was started in, which is the folder `claude --resume` has to be run from. A record with
// no folder still counts towards the figures; it is only never resumed.
export type LiveSession = { pid: number; session: string; directory: string };
```

Change the return type to `Promise<LiveSession[]>`, the array to `const sessions: LiveSession[] = [];`, the cast to `{ pid?: unknown; sessionId?: unknown; cwd?: unknown }`, and the push to:

```typescript
      sessions.push({
        pid: record.pid,
        session: record.sessionId,
        directory: typeof record.cwd === 'string' ? record.cwd : '',
      });
```

- [ ] **Step 4: `src/pane-sessions.ts`.** Replace `sessionsByPane`'s signature and map type; the body is otherwise the same:

```typescript
// Every live session placed on the pane it is running in, whole: the token figures read its id, the
// resume reads its folder. A session whose process has already gone is dropped on its own: its pid is
// not in the tree, so the walk finds no parent and no pane.
//
// Two sessions in one pane cannot happen while both are running — claude holds the terminal — but a
// stale file left by a crash can still name that pane. The last one wins, which is the newer of the
// two, because a stale pid is only reused by a process that started later.
export function sessionsByPane<Live extends { pid: number }>(
  parents: ReadonlyMap<number, number>,
  panes: ReadonlyMap<number, string>,
  sessions: readonly Live[],
): Map<string, Live> {
  const byPane = new Map<string, Live>();
  for (const live of sessions) {
    const pane = paneOfProcess(parents, panes, live.pid);
    if (pane !== undefined) byPane.set(pane, live);
  }
  return byPane;
}
```

- [ ] **Step 5: `src/usage-sweep.ts`.** Import `LiveSession`: `import { liveSessions, sweepUsage, type LiveSession } from './usage-store';`. Add to `UsageSweepPorts`, after `publish`:

```typescript
  // Where every live session is, by pane, after every sweep whether or not the figures moved. Main keeps
  // it so a restart can resume each pane's conversation; claude-resume.ts holds the rest.
  placed(byPane: ReadonlyMap<string, LiveSession>): void;
```

Add to `UsageSweep`, after `start`:

```typescript
  // The same reading the sweep takes, taken now. Quit asks for it so a conversation started, or a
  // /clear typed, in the last half minute is the one saved.
  placeNow(): Promise<Map<string, LiveSession>>;
```

Inside `usageSweep`, before `run`:

```typescript
  // One spelling of "which session is in which pane" for the sweep and for quit, so the two cannot
  // place a session differently.
  async function placeSessions(): Promise<Map<string, LiveSession>> {
    const [tree, sessions] = await Promise.all([ports.processTree(), liveSessions(claudeSessions)]);
    return sessionsByPane(parentProcesses(tree), ports.panePids(), sessions);
  }
```

Replace the start of `run` up to `snapshotOf(`:

```typescript
  async function run(): Promise<void> {
    const now = Date.now();
    // Two reads that need nothing from each other: the logs, and where each running session is.
    const [, byPane] = await Promise.all([sweepUsage(claudeLogs, usageFiles, now), placeSessions()]);
    ports.placed(byPane);
    const open = ports.openProjects().map((projectPath) => ({
      path: projectPath, worktrees: worktreesRoot(projectPath),
    }));
    const next = snapshotOf(
      usageFiles.values(),
      open,
      new Map([...byPane].map(([pane, live]) => [pane, live.session])),
      now,
    );
```

and the return:

```typescript
  return { latest: () => usage, start: () => sweepLater(FIRST_SWEEP_MS), placeNow: placeSessions };
```

In `src/main.ts`, add to the `usageSweep({ ... })` ports, after `publish`, a stand-in Task 4 replaces:

```typescript
  placed: () => undefined,
```

- [ ] **Step 6: Run the checks**

Run: `npm test && npx tsc --noEmit && npx eslint .`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/usage-store.ts src/usage-store.test.ts src/pane-sessions.ts src/pane-sessions.test.ts src/usage-sweep.ts src/main.ts
git commit -m "Have the token sweep report each live session's folder and pane"
```

---

### Task 4: The session store, the resume on spawn, and the reading on Quit

**Files:**
- Create: `src/session-store.ts`
- Modify: `src/main.ts` (imports; `sessionFile` at line 129; `spawnProject` at 486-494; usage sweep ports; `session:read`/`session:write` at 612-615; the close handler in `createWindow`)

**Interfaces:**
- Consumes: `heldSlots`, `resumable`, `withClaude`, `resumeLine`, `ClaudeSlot` (Task 2); `readSession`, `writeSession`, `Session` (Task 2); `UsageSweep.placeNow`, `UsageSweepPorts.placed` (Task 3).
- Produces: `sessionStore(file: string, slotOf: (projectPath: string) => number): ClaudeSessions` with `takeResume(projectPath: string, index: number, id: string): ClaudeSlot | null` and `placed(byPane: ReadonlyMap<string, ClaudeSlot>): void`.

- [ ] **Step 1: Create `src/session-store.ts`**

```typescript
import { ipcMain } from 'electron';
import { existsSync } from 'node:fs';
import { heldSlots, resumable, withClaude, type ClaudeSlot } from './claude-resume';
import { readSession, writeSession, type Session } from './session';

// session.json, read once at launch and written by main alone. The renderer sends the layout whenever it
// changes, as it always has; main writes it with which Claude Code conversation each pane is running,
// which only main can see. Two writers of one file would each wipe the other's half.
//
// Main-process wiring, out of main.ts because main had reached its 600-line ceiling. No test file, under
// the exemption CLAUDE.md gives main's wiring: every rule here is claude-resume.ts's or session.ts's and
// is tested there. What is left is when to write, and handing each saved slot to its pane once.

export type ClaudeSessions = {
  // The conversation a pane being spawned should resume, or null. Asked once per pane per launch: the
  // slot is used up whether or not it resumes, so a project closed and opened again later in the run
  // starts empty like any project opened by hand.
  takeResume(projectPath: string, index: number, id: string): ClaudeSlot | null;
  // Where every live session is, from a sweep or from Quit.
  placed(byPane: ReadonlyMap<string, ClaudeSlot>): void;
};

export function sessionStore(file: string, slotOf: (projectPath: string) => number): ClaudeSessions {
  const saved = readSession(file);
  const pending = new Map(saved.pages.map((page) => [page.path, [...page.claude]]));
  const launchedAt = Date.now();
  const resumed = new Map<string, ClaudeSlot>();
  let live: ReadonlyMap<string, ClaudeSlot> = new Map();
  let layout: Session | null = null;
  let lastWritten = '';

  // Nothing until the renderer has sent a layout: before that there is no list of pages to put the
  // sessions on, and writing the saved file back would be writing yesterday. A sweep that finds the same
  // sessions writes nothing either.
  function write(): void {
    if (layout === null) return;
    const session = withClaude(layout, slotOf, heldSlots(live, resumed, Date.now() - launchedAt));
    const encoded = JSON.stringify(session);
    if (encoded === lastWritten) return;
    lastWritten = encoded;
    writeSession(file, session);
  }

  ipcMain.handle('session:read', () => saved);
  ipcMain.on('session:write', (_event, next: Session) => {
    layout = next;
    write();
  });

  return {
    takeResume(projectPath, index, id) {
      const slots = pending.get(projectPath);
      const slot = slots?.[index];
      if (slots !== undefined) slots[index] = null;
      if (!resumable(slot, existsSync)) return null;
      resumed.set(id, slot);
      return slot;
    },
    placed(byPane) {
      live = byPane;
      write();
    },
  };
}
```

- [ ] **Step 2: Wire it into `src/main.ts`.**

Imports: delete `import { readSession, writeSession, type Session } from './session';` and add:

```typescript
import { sessionStore } from './session-store';
import { resumeLine } from './claude-resume';
```

Delete `const sessionFile = path.join(app.getPath('userData'), 'session.json');` and change the comment above it to "The recently opened projects live next to the app's other per-user state."

In `spawnProject`, replace the loop body:

```typescript
  for (let terminalIndex = 0; terminalIndex < TERMINAL_COUNT; terminalIndex++) {
    const id = terminalId(projectIndex, terminalIndex);
    // A pane that was running Claude Code when the app last quit starts in that conversation's folder
    // with the resume typed into its shell. session-store.ts says when a pane has one.
    const resume = claudeSessions.takeResume(project.path, terminalIndex, id);
    terminalCommands.set(id, { args: [], directory: resume?.directory ?? project.path });
    spawnTerminal(id);
    if (resume !== null) shells.get(id)?.write(resumeLine(resume));
  }
```

In the `usageSweep({ ... })` ports, replace the Task 3 stand-in with:

```typescript
  placed: (byPane) => claudeSessions.placed(byPane),
```

Replace the four lines from `// Read once at startup and written back whenever the layout changes` through the `session:write` handler with:

```typescript
// Read once at startup and written back whenever the layout changes or a pane's Claude session does,
// so a crash loses at most the change you were making, or half a minute of sessions.
const claudeSessions = sessionStore(path.join(app.getPath('userData'), 'session.json'), slotOfProject);
```

In the close handler in `createWindow`, replace

```typescript
    }).then(({ response }) => {
      if (response === 1) mainWindow.destroy();
    }).finally(() => {
```

with

```typescript
    }).then(async ({ response }) => {
      if (response !== 1) return;
      // One last reading before the shells die, so a conversation started or cleared since the last
      // sweep is the one the next launch resumes. A reading that fails still quits, on the last sweep's.
      await tokenUsage.placeNow().then((byPane) => claudeSessions.placed(byPane), () => undefined);
      mainWindow.destroy();
    }).finally(() => {
```

- [ ] **Step 3: Run the checks**

Run: `npm test && npx tsc --noEmit && npx eslint . && grep -v '^\s*$' src/main.ts | grep -v '^\s*//' | wc -l`
Expected: PASS, and the count is at most 600.

- [ ] **Step 4: Commit**

```bash
git add src/session-store.ts src/main.ts
git commit -m "Resume each pane's Claude session on launch and save it on Quit"
```

---

### Task 5: Help text, version, and the check by hand

**Files:**
- Modify: `src/help.ts` (the `projects` blurb, near line 287)
- Modify: `package.json` (`version`)

- [ ] **Step 1: `src/help.ts`.** In the `projects` blurb, change

```typescript
    + 'through the manager on the way round. The window opens on the projects the last run was left '
    + 'on, and closing it asks first, because it kills every shell in every project. '
```

to

```typescript
    + 'through the manager on the way round. The window opens on the projects the last run was left '
    + 'on, and a pane that was running Claude Code comes back in that conversation, resumed in the '
    + 'folder it ran in. Closing the window asks first, because it kills every shell in every project. '
```

- [ ] **Step 2: `package.json`.** `"version": "1.14.0"` becomes `"version": "1.15.0"`.

- [ ] **Step 3: Run the checks**

Run: `npm test && npx tsc --noEmit && npx eslint .`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/help.ts package.json
git commit -m "Say in the help that a restart resumes each pane's Claude session"
```

- [ ] **Step 5: Hand to the person for the check by hand.** Do not launch, quit or install the app. Say the installed app needs a rebuild (`/rebuild`) and a restart, then:
  1. Open a project; run `claude` in terminal 2 and terminal 4 and send a message in each.
  2. Wait 30 seconds, quit, relaunch: both conversations are back in their own panes.
  3. Ship a card so a pane runs in a worktree; quit and relaunch: that pane resumes in the worktree.
  4. Quit, remove that worktree by hand, relaunch: that pane is a plain shell at the project.
  5. Exit Claude in terminal 2, wait a minute, quit, relaunch: terminal 2 is a plain shell.
