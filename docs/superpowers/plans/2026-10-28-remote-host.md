# Remote Host Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The laptop's Dashboard serves its session over a websocket; the mac's Dashboard connects from the Ctrl+S picker and becomes a second screen of the same shells, boards and notes.

**Architecture:** Main's IPC handlers move from `ipcMain` calls into one channel table that both `ipcMain` and a websocket server dispatch into, each call tagged with the screen it came from. Pushes to the renderer become broadcasts to every screen. On the client, the same table is bypassed: a relay forwards every non-local channel to the host and relays the host's pushes to the renderer. The renderer changes in one place only: the host owns the list of open projects and pushes it, and the renderer reconciles its pages from that list.

**Tech Stack:** Electron, node-pty, `ws` (new), vitest.

**Spec:** `docs/superpowers/specs/2026-10-28-remote-host-design.md`

Card: `cb8ff4a0-49d5-4696-ab2c-e18197c11484`. Move it to Doing before Task 1's first edit (`node "$DASHBOARD_BOARD" move cb8ff4a0 Doing`), and to Review when the pull request is open. One pull request, branch `remote-host`.

## Global Constraints

- Checks before every commit: `npm test`, `npx tsc --noEmit`, `npx eslint .`.
- Never quit, kill, restart or replace the running Dashboard app.
- Identifiers spelled out in full, no abbreviations (`connection`, not `conn`; `request`, not `req`).
- Every `<input>` and `<textarea>` created gets `dir = 'auto'`.
- A refusal is explained where it is decided; an error shown to a person goes through `failureText`.
- IPC channels are `<noun>:<verb>`.
- `src/main.ts` is at its 600-line ceiling: every task that touches it must leave it no longer. New code goes in new files.
- `src/help.ts` is updated in the same change as the picker rows (Task 9).
- `package.json` `version` bumps minor: `1.16.0` → `1.17.0` (Task 10).
- No mention of any AI tool in commits, comments or docs.
- Plain text over the home wifi, guarded by the token, is the accepted scope. Do not add TLS or a login.

## Review Focus

Inputs the spec implies but no task's tests exercise unless added here. Each line's test is added to the owning task.

1. **Settings stay on the screen that shows them.** A mac connected to a Linux host must keep its own Cmd bindings, font and theme, and the host's `shellCommand` must stay the host's. `settings:read` and `settings:write` are client-local channels. Test in Task 1: `isClientChannel('settings:read')` is true.
2. **A dropped request never hangs a dialog.** A reply that never comes must reject after 10 seconds with `No answer from <address>`, so a board write made during a wifi drop fails on the status bar instead of leaving the card half-moved forever. Test in Task 8.
3. **The two screens do not fight over a pane's size.** Host window 200 columns, mac 120: the shell gets 120. Mac disconnects: the shell goes back to 200. Test in Task 3.
4. **The second screen's first paint is the current screen, not an hour of scrollback doubled.** The ring is capped and replay begins with a terminal reset. Test in Task 2: a ring given more than its capacity keeps only the tail; `replay()` starts with `\x1bc`.
5. **A project opened on one screen appears on the other, and one closed disappears, without the renderer building a page twice.** `applyProjects` is idempotent: the same list twice leaves the pages untouched. Test in Task 5 (`page-reconcile.test.ts`).

---

### Task 1: Protocol and channel lists

**Files:**
- Create: `src/remote-protocol.ts`
- Create: `src/remote-protocol.test.ts`
- Modify: `package.json` (dependencies)

**Interfaces:**
- Produces:
  ```ts
  export type Request = { id: number; channel: string; args: unknown[] };
  export type Reply = { id: number; result?: unknown; error?: string };
  export type Push = { channel: string; args: unknown[] };
  export type Frame = Request | Reply | Push;
  export const HELLO_CHANNEL = 'host:hello';
  export const CLOSE_BAD_TOKEN = 4001;
  export const CLOSE_BAD_VERSION = 4002;
  export const REQUEST_TIMEOUT_MS = 10_000;
  export function encodeFrame(frame: Frame): string;
  export function decodeFrame(text: string): Frame | null;   // null for anything that is not a frame
  export function isRequest(frame: Frame): frame is Request;
  export function isReply(frame: Frame): frame is Reply;
  export function isClientChannel(channel: string): boolean;
  export function helloRefusal(token: string, version: string, expectedToken: string, expectedVersion: string): { code: number; reason: string } | null;
  ```

- [ ] **Step 1: Install `ws`**

```bash
npm install ws && npm install --save-dev @types/ws
```

- [ ] **Step 2: Write the failing test**

`src/remote-protocol.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  CLOSE_BAD_TOKEN, CLOSE_BAD_VERSION, decodeFrame, encodeFrame, helloRefusal, isClientChannel, isReply, isRequest,
} from './remote-protocol';

describe('frames', () => {
  it('round-trips a request, a reply and a push', () => {
    const request = { id: 1, channel: 'board:read', args: ['/code/api'] };
    const reply = { id: 1, result: { ok: true } };
    const push = { channel: 'pty:data', args: ['0-1', 'hello'] };
    for (const frame of [request, reply, push]) expect(decodeFrame(encodeFrame(frame))).toEqual(frame);
  });

  it('tells the three apart', () => {
    expect(isRequest({ id: 1, channel: 'x:y', args: [] })).toBe(true);
    expect(isReply({ id: 1, result: null })).toBe(true);
    expect(isReply({ id: 1, error: 'no' })).toBe(true);
    expect(isRequest({ channel: 'x:y', args: [] })).toBe(false);
    expect(isReply({ channel: 'x:y', args: [] })).toBe(false);
  });

  it('answers null for text that is not a frame', () => {
    expect(decodeFrame('not json')).toBeNull();
    expect(decodeFrame('{"id":1}')).toBeNull();
    expect(decodeFrame('{"channel":"x","args":"not a list"}')).toBeNull();
  });
});

describe('isClientChannel', () => {
  it('keeps what belongs to the screen on the screen', () => {
    for (const channel of ['link:open', 'notification:show', 'settings:read', 'settings:write', 'host:connect', 'host:disconnect']) {
      expect(isClientChannel(channel)).toBe(true);
    }
  });

  it('sends everything else to the host', () => {
    for (const channel of ['pty:input', 'board:read', 'scrollback:open', 'file:open', 'projects:open', 'log:read']) {
      expect(isClientChannel(channel)).toBe(false);
    }
  });
});

describe('helloRefusal', () => {
  it('accepts the right token and version', () => {
    expect(helloRefusal('t', '1.17.0', 't', '1.17.0')).toBeNull();
  });

  it('refuses a wrong token before it looks at the version', () => {
    expect(helloRefusal('x', '1.0.0', 't', '1.17.0')).toEqual({ code: CLOSE_BAD_TOKEN, reason: 'The host refused the token' });
  });

  it('names both versions when they differ', () => {
    expect(helloRefusal('t', '1.16.0', 't', '1.17.0')).toEqual({
      code: CLOSE_BAD_VERSION, reason: 'The host runs Dashboard 1.17.0, this is 1.16.0',
    });
  });
});
```

- [ ] **Step 3: Run it, expect failure**

Run: `npx vitest run src/remote-protocol.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 4: Implement**

`src/remote-protocol.ts`:

```ts
import { isRecord } from './is-record';

// The wire between a screen and the host: the bridge's own channels, one JSON frame per line of the
// socket. A request carries an id so its reply finds it; a push has none. Shared by remote-host.ts and
// remote-client.ts so neither holds its own idea of the shape.
export type Request = { id: number; channel: string; args: unknown[] };
export type Reply = { id: number; result?: unknown; error?: string };
export type Push = { channel: string; args: unknown[] };
export type Frame = Request | Reply | Push;

export const HELLO_CHANNEL = 'host:hello';
// Close codes a client reads to say why it was refused. 4000 and up are an application's own.
export const CLOSE_BAD_TOKEN = 4001;
export const CLOSE_BAD_VERSION = 4002;
export const REQUEST_TIMEOUT_MS = 10_000;

// What never leaves the screen: a link opens in the browser you are looking at, a banner shows on the
// desk you are sitting at, and the settings — keys, font, theme — are this machine's. A mac on a Linux
// host must keep its Cmd bindings. Connecting and disconnecting are the client's own by definition.
const CLIENT_CHANNELS = new Set([
  'link:open', 'notification:show', 'settings:read', 'settings:write', 'host:connect', 'host:disconnect',
]);

export function isClientChannel(channel: string): boolean {
  return CLIENT_CHANNELS.has(channel);
}

export function encodeFrame(frame: Frame): string {
  return JSON.stringify(frame);
}

export function decodeFrame(text: string): Frame | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const hasId = typeof parsed.id === 'number';
  const hasChannel = typeof parsed.channel === 'string';
  const hasArgs = Array.isArray(parsed.args);
  if (hasChannel && hasArgs) return parsed as unknown as Request | Push;
  if (hasId && !hasChannel && ('result' in parsed || 'error' in parsed)) return parsed as unknown as Reply;
  return null;
}

export function isRequest(frame: Frame): frame is Request {
  return 'id' in frame && 'channel' in frame;
}

export function isReply(frame: Frame): frame is Reply {
  return 'id' in frame && !('channel' in frame);
}

// The host's answer to a hello. The token first: a wrong token learns nothing about the host, not even
// its version. The versions must match because the protocol is the bridge itself, and two builds can
// disagree about an argument's shape.
export function helloRefusal(
  token: string, version: string, expectedToken: string, expectedVersion: string,
): { code: number; reason: string } | null {
  if (token !== expectedToken) return { code: CLOSE_BAD_TOKEN, reason: 'The host refused the token' };
  if (version !== expectedVersion) {
    return { code: CLOSE_BAD_VERSION, reason: `The host runs Dashboard ${expectedVersion}, this is ${version}` };
  }
  return null;
}
```

Check `src/is-record.ts` exports `isRecord(value: unknown): value is Record<string, unknown>`; it is imported by `settings.ts` already.

- [ ] **Step 5: Run the test, expect pass**

Run: `npx vitest run src/remote-protocol.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/remote-protocol.ts src/remote-protocol.test.ts
git commit -m "Add the frame protocol and channel lists for a remote screen"
```

---

### Task 2: Pane output ring

**Files:**
- Create: `src/pane-ring.ts`, `src/pane-ring.test.ts`
- Modify: `src/main.ts:450-500` (`spawnTerminal`), `src/main.ts:605-630` (`projects:close`)

**Interfaces:**
- Produces:
  ```ts
  export const PANE_RING_LIMIT = 256 * 1024;
  export type PaneRing = { push(data: string): void; replay(): string; clear(): void };
  export function paneRing(limit = PANE_RING_LIMIT): PaneRing;
  ```
  `replay()` returns `'\x1bc' + <last limit characters>`; `'\x1bc'` is the terminal's full reset, so a screen that already had the pane's output is cleared before the replay rather than shown it twice.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { paneRing } from './pane-ring';

describe('paneRing', () => {
  it('replays what was pushed, after a reset', () => {
    const ring = paneRing(100);
    ring.push('one ');
    ring.push('two');
    expect(ring.replay()).toBe('\x1bcone two');
  });

  it('keeps only the tail once over its limit', () => {
    const ring = paneRing(5);
    ring.push('abcdefgh');
    ring.push('ij');
    expect(ring.replay()).toBe('\x1bcfghij');
  });

  it('is empty after a clear', () => {
    const ring = paneRing(5);
    ring.push('abc');
    ring.clear();
    expect(ring.replay()).toBe('\x1bc');
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run src/pane-ring.test.ts`

- [ ] **Step 3: Implement**

```ts
// The last stretch of a pane's output, kept so a screen that connects mid-run sees the pane as it is
// rather than blank. 256 KB is a few thousand lines: more than the screen, less than a memory problem
// times thirty panes. Replay opens with the terminal's full reset so a screen reconnecting after a drop
// shows the output once.
export const PANE_RING_LIMIT = 256 * 1024;
const RESET = '\x1bc';

export type PaneRing = { push(data: string): void; replay(): string; clear(): void };

export function paneRing(limit = PANE_RING_LIMIT): PaneRing {
  // ponytail: one string, sliced when it overflows; a chunk list if the slice ever shows in a profile.
  let text = '';
  return {
    push(data) {
      text += data;
      if (text.length > limit) text = text.slice(text.length - limit);
    },
    replay: () => RESET + text,
    clear() { text = ''; },
  };
}
```

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Wire into main**

In `src/main.ts`, beside `const shells = new Map<string, pty.IPty>();` add:

```ts
// What each live pane has printed lately, for a screen that joins mid-run; pane-ring.ts says how much.
const rings = new Map<string, PaneRing>();
```

Import `paneRing, type PaneRing` from `'./pane-ring'`. In `spawnTerminal`, after the pty is spawned, before `terminalProcess.onData(...)`:

```ts
  const ring = paneRing();
  rings.set(id, ring);
  terminalProcess.onData((data) => {
    ring.push(data);
    sendToRenderer('pty:data', id, data);
  });
```

(Replace the existing one-line `onData`.) In `projects:close`, inside the `for (const id of paneIds(slot))` loop, add `rings.delete(id);` beside `paneSizes.delete(id);`.

- [ ] **Step 6: Checks and commit**

```bash
npm test && npx tsc --noEmit && npx eslint . && wc -l src/main.ts
git add src/pane-ring.ts src/pane-ring.test.ts src/main.ts
git commit -m "Keep the tail of each pane's output for a screen that joins later"
```

If `wc -l src/main.ts` grew past where it was, move the `rings` map and the two lines into `pane-channels.ts`'s `main` argument instead; the constraint is no growth.

---

### Task 3: Pane sizes per screen

**Files:**
- Create: `src/screens.ts`, `src/screens.test.ts`
- Modify: `src/terminals.ts:120-124`, `src/pane-channels.ts`, `src/main.ts` (every `paneSizes` use)

**Interfaces:**
- Produces:
  ```ts
  export const LOCAL_SCREEN = 'local';
  export type Screens = {
    resize(screen: string, paneId: string, size: PaneSize): void;
    forget(screen: string): void;          // the screen left; its sizes go
    drop(paneId: string): void;            // the pane left; every screen's size for it goes
    sizeOf(paneId: string): PaneSize | undefined;   // smallest cols and smallest rows across screens
    ids(): string[];                       // connected screens, LOCAL_SCREEN included once it has resized anything
  };
  export function screens(): Screens;
  ```
- `sizeOfPane(sizes, id)` in `terminals.ts` changes its first parameter from `ReadonlyMap<string, PaneSize>` to `{ sizeOf(id: string): PaneSize | undefined }`. A `Map` does not satisfy that; `Screens` does.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { screens, LOCAL_SCREEN } from './screens';
import { sizeOfPane, DEFAULT_PANE_SIZE } from './terminals';

describe('screens', () => {
  it('gives a shell the smallest of what every screen reports', () => {
    const all = screens();
    all.resize(LOCAL_SCREEN, '0-1', { cols: 200, rows: 50 });
    all.resize('mac', '0-1', { cols: 120, rows: 60 });
    expect(all.sizeOf('0-1')).toEqual({ cols: 120, rows: 50 });
  });

  it('goes back to the remaining screen when one leaves', () => {
    const all = screens();
    all.resize(LOCAL_SCREEN, '0-1', { cols: 200, rows: 50 });
    all.resize('mac', '0-1', { cols: 120, rows: 60 });
    all.forget('mac');
    expect(all.sizeOf('0-1')).toEqual({ cols: 200, rows: 50 });
  });

  it('answers undefined for a pane nobody has measured, and the default through sizeOfPane', () => {
    const all = screens();
    expect(all.sizeOf('0-1')).toBeUndefined();
    expect(sizeOfPane(all, '0-1')).toEqual(DEFAULT_PANE_SIZE);
  });

  it('drops a pane from every screen', () => {
    const all = screens();
    all.resize(LOCAL_SCREEN, '0-1', { cols: 80, rows: 24 });
    all.resize('mac', '0-1', { cols: 80, rows: 24 });
    all.drop('0-1');
    expect(all.sizeOf('0-1')).toBeUndefined();
  });

  it('lists the screens that have reported', () => {
    const all = screens();
    all.resize(LOCAL_SCREEN, '0-1', { cols: 80, rows: 24 });
    all.resize('mac', '0-2', { cols: 80, rows: 24 });
    expect(all.ids().sort()).toEqual(['local', 'mac']);
  });
});
```

- [ ] **Step 2: Run, expect failure**

- [ ] **Step 3: Implement**

`src/screens.ts`:

```ts
import type { PaneSize } from './terminals';

// Every screen looking at the session, and how big each one draws each pane. A shell gets the smallest
// columns and the smallest rows anyone reports, the way tmux does, so nothing is cut off on any screen.
// The host's own window is a screen like the others, named LOCAL_SCREEN.
export const LOCAL_SCREEN = 'local';

export type Screens = {
  resize(screen: string, paneId: string, size: PaneSize): void;
  forget(screen: string): void;
  drop(paneId: string): void;
  sizeOf(paneId: string): PaneSize | undefined;
  ids(): string[];
};

export function screens(): Screens {
  const sizes = new Map<string, Map<string, PaneSize>>();
  return {
    resize(screen, paneId, size) {
      let perPane = sizes.get(screen);
      if (!perPane) sizes.set(screen, (perPane = new Map()));
      perPane.set(paneId, size);
    },
    forget(screen) { sizes.delete(screen); },
    drop(paneId) { for (const perPane of sizes.values()) perPane.delete(paneId); },
    sizeOf(paneId) {
      let smallest: PaneSize | undefined;
      for (const perPane of sizes.values()) {
        const size = perPane.get(paneId);
        if (!size) continue;
        smallest = smallest
          ? { cols: Math.min(smallest.cols, size.cols), rows: Math.min(smallest.rows, size.rows) }
          : size;
      }
      return smallest;
    },
    ids: () => [...sizes.keys()],
  };
}
```

`src/terminals.ts`:

```ts
export function sizeOfPane(sizes: { sizeOf(id: string): PaneSize | undefined }, id: string): PaneSize {
  return sizes.sizeOf(id) ?? DEFAULT_PANE_SIZE;
}
```

Fix the existing `terminals.test.ts` case for `sizeOfPane` if it passes a `Map`: wrap as `{ sizeOf: (id) => map.get(id) }`.

- [ ] **Step 4: Replace `paneSizes` in main and pane-channels**

In `src/main.ts`: `const paneSizes = new Map<string, PaneSize>();` becomes `const paneScreens = screens();` (import `screens` from `'./screens'`, drop the `PaneSize` import if now unused). `sizeOfPane(paneSizes, id)` → `sizeOfPane(paneScreens, id)`. `paneSizes.delete(id)` → `paneScreens.drop(id)`. `registerPaneChannels({ shells, paneSizes, ... })` → `registerPaneChannels({ shells, screens: paneScreens, ... })`.

In `src/pane-channels.ts`: the `main` type gains `screens: Screens` in place of `paneSizes`; the resize handler becomes

```ts
  ipcMain.on('pty:resize', (_event, id: string, cols: number, rows: number) => {
    main.screens.resize(LOCAL_SCREEN, id, { cols, rows });
    const size = main.screens.sizeOf(id);
    if (size) main.shells.get(id)?.resize(size.cols, size.rows);
  });
```

Task 4 replaces `LOCAL_SCREEN` here with the screen the call came from.

- [ ] **Step 5: Checks and commit**

```bash
npm test && npx tsc --noEmit && npx eslint .
git add src/screens.ts src/screens.test.ts src/terminals.ts src/terminals.test.ts src/pane-channels.ts src/main.ts
git commit -m "Size each shell to the smallest of the screens looking at it"
```

---

### Task 4: One channel table, tagged with the screen

**Files:**
- Create: `src/channels.ts`, `src/channels.test.ts`
- Modify: `src/main.ts`, `src/pane-channels.ts`, `src/pane-openers.ts`, `src/log-ipc.ts`, `src/project-files-ipc.ts`, `src/session-store.ts`, `src/task-runner.ts`

**Interfaces:**
- Produces:
  ```ts
  export type ChannelHandler = (screen: string, ...args: any[]) => unknown;
  export type Channels = {
    handle(channel: string, handler: ChannelHandler): void;   // request with a reply
    on(channel: string, handler: ChannelHandler): void;       // fire and forget
    invoke(screen: string, channel: string, args: unknown[]): Promise<unknown>;  // rejects for an unknown channel
    dispatch(screen: string, channel: string, args: unknown[]): void;           // ignores an unknown channel
  };
  export function channels(): Channels;
  // Wires every registered channel to ipcMain as LOCAL_SCREEN. `remote()` is asked per call: when it
  // answers a client, non-local channels go to it instead. Task 8 supplies the client.
  export function registerWithIpc(table: Channels, remote: () => RemoteTarget | null): void;
  export type RemoteTarget = { invoke(channel: string, args: unknown[]): Promise<unknown>; send(channel: string, args: unknown[]): void };
  ```
- Every `register*` function stops importing `ipcMain` and takes `table: Channels`. Handler bodies gain a leading `screen: string` parameter in place of `_event`. Nothing else in a body changes except `pane-channels.ts`'s resize, which uses `screen`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { channels } from './channels';

describe('channels', () => {
  it('invokes a handler with the screen first and answers its result', async () => {
    const table = channels();
    table.handle('board:read', (screen, projectPath) => `${screen}:${projectPath}`);
    await expect(table.invoke('mac', 'board:read', ['/code/api'])).resolves.toBe('mac:/code/api');
  });

  it('rejects an unknown channel by name', async () => {
    const table = channels();
    await expect(table.invoke('mac', 'nope:nothing', [])).rejects.toThrow('No such channel: nope:nothing');
  });

  it('dispatches a send and ignores one nobody registered', () => {
    const table = channels();
    const seen: unknown[] = [];
    table.on('pty:input', (screen, id, data) => seen.push([screen, id, data]));
    table.dispatch('mac', 'pty:input', ['0-1', 'ls']);
    table.dispatch('mac', 'nope:nothing', []);
    expect(seen).toEqual([['mac', '0-1', 'ls']]);
  });

  it('turns a throwing handler into a rejection, not a crash', async () => {
    const table = channels();
    table.handle('board:write', () => { throw new Error('disk full'); });
    await expect(table.invoke('mac', 'board:write', [])).rejects.toThrow('disk full');
  });
});
```

- [ ] **Step 2: Run, expect failure**

- [ ] **Step 3: Implement `src/channels.ts`**

```ts
import { ipcMain } from 'electron';
import { isClientChannel } from './remote-protocol';
import { LOCAL_SCREEN } from './screens';

// Every channel main answers, in one table, so two callers can reach them: ipcMain for the host's own
// window, and the websocket for every other screen. The screen a call came from is the first argument,
// because a pane's size is the screen's and so is a banner's click.
export type ChannelHandler = (screen: string, ...args: any[]) => unknown;

export type Channels = {
  handle(channel: string, handler: ChannelHandler): void;
  on(channel: string, handler: ChannelHandler): void;
  invoke(screen: string, channel: string, args: unknown[]): Promise<unknown>;
  dispatch(screen: string, channel: string, args: unknown[]): void;
};

export type RemoteTarget = {
  invoke(channel: string, args: unknown[]): Promise<unknown>;
  send(channel: string, args: unknown[]): void;
};

export function channels(): Channels {
  const handlers = new Map<string, ChannelHandler>();
  const listeners = new Map<string, ChannelHandler>();
  return {
    handle(channel, handler) { handlers.set(channel, handler); },
    on(channel, handler) { listeners.set(channel, handler); },
    async invoke(screen, channel, args) {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`No such channel: ${channel}`);
      return handler(screen, ...args);
    },
    dispatch(screen, channel, args) {
      listeners.get(channel)?.(screen, ...args);
    },
  };
}

// The host's own window reaches the table through ipcMain, as LOCAL_SCREEN. When this app is a client
// of another host, every channel that is not the screen's own goes to that host instead; the table is
// bypassed, not emptied, so disconnecting brings the local session straight back.
export function registerWithIpc(table: Channels, remote: () => RemoteTarget | null, names: { handled: string[]; listened: string[] }): void {
  for (const channel of names.handled) {
    ipcMain.handle(channel, (_event, ...args: unknown[]) => {
      const target = remote();
      return target && !isClientChannel(channel) ? target.invoke(channel, args) : table.invoke(LOCAL_SCREEN, channel, args);
    });
  }
  for (const channel of names.listened) {
    ipcMain.on(channel, (_event, ...args: unknown[]) => {
      const target = remote();
      if (target && !isClientChannel(channel)) target.send(channel, args);
      else table.dispatch(LOCAL_SCREEN, channel, args);
    });
  }
}
```

Make `channels()` remember its names so `registerWithIpc` can take them from the table rather than a list: add `handled(): string[]` and `listened(): string[]` to `Channels`, returning `[...handlers.keys()]` and `[...listeners.keys()]`, and change `registerWithIpc(table, remote)` to read `table.handled()` and `table.listened()`. Update the test's type expectations accordingly. `registerWithIpc` runs once, after every `register*` call in main, so order in main matters: it is the last line before `app.on('ready', ...)`.

- [ ] **Step 4: Run the unit test, expect pass**

- [ ] **Step 5: Migrate every registration**

Mechanical. In each file, replace `import { ipcMain } from 'electron'` with `import type { Channels } from './channels'` (keep other electron imports such as `Notification`, `app`, `shell`), add a `table: Channels` parameter, and rewrite:

- `ipcMain.handle('x:y', (_event, a, b) => ...)` → `table.handle('x:y', (_screen, a, b) => ...)`
- `ipcMain.on('x:y', (_event, a) => ...)` → `table.on('x:y', (_screen, a) => ...)`

Files and signatures after:

- `src/pane-channels.ts`: `registerPaneChannels(table: Channels, main: {...})`. Resize uses the screen: `main.screens.resize(screen, id, { cols, rows })`. `notification:show` stays here; it only ever runs for `LOCAL_SCREEN` because the client keeps that channel (Task 1), so no branch.
- `src/pane-openers.ts`: `registerPaneOpeners(table: Channels, main: {...})`.
- `src/log-ipc.ts`: `registerLog(table: Channels, directory, send)`.
- `src/project-files-ipc.ts`: `registerProjectFiles(table: Channels, boards, changes)`.
- `src/session-store.ts`: `sessionStore(table: Channels, file, slotOf)`. The `session:write` handler ignores a remote screen's layout:
  ```ts
  table.on('session:write', (screen, next: Session) => {
    // A couch layout must not overwrite the desk's: the file is the host window's.
    if (screen !== LOCAL_SCREEN) return;
    layout = next;
    write();
  });
  ```
  Import `LOCAL_SCREEN` from `'./screens'`.
- `src/task-runner.ts`: `registerTasks(table: Channels, ports)`.
- `src/main.ts`: create `const table = channels();` near the top (after `failures`), replace every `ipcMain.handle`/`ipcMain.on` with `table.handle`/`table.on` and `_event` with `_screen`, pass `table` to every `register*` and to `sessionStore`, and add before `app.on('ready', ...)`:
  ```ts
  registerWithIpc(table, () => null);
  ```
  Remove `ipcMain` from the electron import. `projects:open`'s `dialog.showOpenDialog(mainWindow, ...)` stays for now; Task 9 refuses it for a remote screen.

- [ ] **Step 6: Checks**

```bash
npx tsc --noEmit && npx eslint . && npm test && wc -l src/main.ts
```

Expected: all pass; `main.ts` not longer than before the task. Start the app once by hand (`npm start`), open a project, type in a pane, resize the window, open the board, run a command on the command screen: every channel still answers.

- [ ] **Step 7: Commit**

```bash
git add src/channels.ts src/channels.test.ts src/main.ts src/pane-channels.ts src/pane-openers.ts src/log-ipc.ts src/project-files-ipc.ts src/session-store.ts src/task-runner.ts
git commit -m "Route every main channel through one table tagged with the screen it came from"
```

---

### Task 5: The host owns the list of open projects

**Files:**
- Create: `src/page-reconcile.ts`, `src/page-reconcile.test.ts`
- Modify: `src/bridge.ts:36-37`, `src/preload.ts`, `src/main.ts:572-630`, `src/renderer.ts:424-433` (`setPage`), `src/renderer.ts:461-520` (`closeProject`), `src/renderer.ts:543-552` (`openProject`), `src/log-entry.ts:8`

**Interfaces:**
- Produces:
  ```ts
  // bridge.ts
  export type OpenProjects = { host: string; projects: (Project | null)[] };   // index is the slot
  openProject(projectPath: string | null): Promise<{ index: number; open: OpenProjects } | null>;
  onProjectsChange(listener: (open: OpenProjects) => void): void;    // channel 'projects:change'
  // page-reconcile.ts
  export type PageMove =
    | { kind: 'reset' }
    | { kind: 'remove'; slot: number }
    | { kind: 'build'; slot: number; project: Project };
  export function pageMoves(current: { slot: number; project: Project }[], currentHost: string, next: OpenProjects): PageMove[];
  ```
  `pageMoves` is the decision; the renderer applies it. `reset` comes first and alone when the host changed (every page goes, then every project builds). A page whose slot holds the same path with the same `missing` is untouched. A project in the list with no page → `build`. A page whose slot is now `null` or a different path → `remove` then `build` when there is a project.
- `LOG_KINDS` gains `'screen'`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { pageMoves } from './page-reconcile';
import type { Project } from './projects';

const project = (path: string, missing = false): Project => ({ name: path.split('/').pop() ?? path, path, missing });

describe('pageMoves', () => {
  it('builds a page for a project that has none and removes one whose slot emptied', () => {
    const current = [{ slot: 0, project: project('/a') }, { slot: 1, project: project('/b') }];
    const moves = pageMoves(current, 'local', { host: 'local', projects: [project('/a'), null, project('/c')] });
    expect(moves).toEqual([
      { kind: 'remove', slot: 1 },
      { kind: 'build', slot: 2, project: project('/c') },
    ]);
  });

  it('does nothing twice for the same list', () => {
    const current = [{ slot: 0, project: project('/a') }];
    expect(pageMoves(current, 'local', { host: 'local', projects: [project('/a')] })).toEqual([]);
  });

  it('rebuilds a page whose project came back from missing', () => {
    const current = [{ slot: 0, project: project('/a', true) }];
    expect(pageMoves(current, 'local', { host: 'local', projects: [project('/a')] })).toEqual([
      { kind: 'remove', slot: 0 },
      { kind: 'build', slot: 0, project: project('/a') },
    ]);
  });

  it('starts over when the host changed', () => {
    const current = [{ slot: 0, project: project('/a') }];
    expect(pageMoves(current, 'local', { host: '192.168.1.5:7777', projects: [project('/x')] })).toEqual([
      { kind: 'reset' },
      { kind: 'build', slot: 0, project: project('/x') },
    ]);
  });
});
```

- [ ] **Step 2: Run, expect failure**

- [ ] **Step 3: Implement `src/page-reconcile.ts`**

```ts
import type { OpenProjects } from './bridge';
import type { Project } from './projects';

// What the renderer does to its pages when the host says which projects are open. The host owns the
// list, since two screens can open and close projects; each screen gets the list and makes its pages
// match. Pure, so it is tested without a window.
export type PageMove =
  | { kind: 'reset' }
  | { kind: 'remove'; slot: number }
  | { kind: 'build'; slot: number; project: Project };

export function pageMoves(
  current: { slot: number; project: Project }[], currentHost: string, next: OpenProjects,
): PageMove[] {
  const moves: PageMove[] = [];
  // Another host's slot 0 is not this one's: nothing on screen belongs to it.
  const kept = next.host === currentHost ? current : [];
  if (next.host !== currentHost) moves.push({ kind: 'reset' });
  const bySlot = new Map(kept.map((page) => [page.slot, page.project]));
  const slots = new Set([...bySlot.keys(), ...next.projects.keys()]);
  for (const slot of [...slots].sort((first, second) => first - second)) {
    const have = bySlot.get(slot);
    const want = next.projects[slot] ?? null;
    const same = have && want && have.path === want.path && have.missing === want.missing;
    if (same) continue;
    if (have) moves.push({ kind: 'remove', slot });
    if (want) moves.push({ kind: 'build', slot, project: want });
  }
  return moves;
}
```

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Bridge and preload**

`src/bridge.ts`: add `export type OpenProjects = { host: string; projects: (Project | null)[] };` and change `openProject`'s return to `Promise<{ index: number; open: OpenProjects } | null>`; add `onProjectsChange(listener: (open: OpenProjects) => void): void;`.

`src/preload.ts`: add

```ts
  onProjectsChange: (listener) =>
    ipcRenderer.on('projects:change', (_event, open) => listener(open)),
```

- [ ] **Step 6: Main pushes the list**

`src/log-entry.ts`: `LOG_KINDS` gains `'screen'` at the end.

`src/main.ts`: add once, near `slotOfProject`:

```ts
// The list every screen draws its tabs from. `host` is what the renderer tells one session from
// another by; the local window's is LOCAL_SCREEN and a remote screen's is the address it typed.
function openProjects(): OpenProjects {
  return { host: LOCAL_SCREEN, projects: projects.map((project) => project ?? null) };
}
```

`projects:open` returns `{ index, open: openProjects() }` instead of `{ index, project, replaced }`, and before the return: `sendToRenderer('projects:change', openProjects());`. `projects:close`, at its end: `sendToRenderer('projects:change', openProjects());`. The `replaced` boolean is no longer returned; keep the local `replaced` for the branch that spawns.

Check `main.ts` length. If it grew, move `openProjects()` into `src/screens.ts`? No: it reads `projects`. Instead shorten a comment block in `projects:close` by the same number of lines, or move `processTree` (`main.ts:184-197`) into `src/process-tree.ts` with its comment, exported as is. Prefer the move.

- [ ] **Step 7: Renderer applies the list**

In `src/renderer.ts`:

1. Add `let currentHost = 'local';` beside `let closing = false;`.
2. Extract the page removal from `closeProject` into a function used by both:

   ```ts
   // Takes a project's page off the screen and out of the list. What the close key does after main has
   // agreed, and what applyProjects does for a project another screen closed.
   function removePage(slot: number): void {
     const position = positionOfSlot(slot);
     const page = pages[position];
     if (!page || !isProjectPage(page)) return;
     discardPanes(slot);
     page.board?.close();
     page.element.remove();
     pages.splice(position, 1);
   }
   ```

   `closeProject`'s tail becomes `bridge.closeProject(slot); removePage(slot);` followed by the existing landing logic (the lines after `pages.splice` that pick the tab to land on; read them and keep them, using the `closingPosition` already computed before the call).
3. Add:

   ```ts
   // The host's list of open projects, made true on this screen. Pages that already match are left
   // alone, which is what lets the push and the reply to our own open both carry the list.
   function applyProjects(open: OpenProjects): void {
     const current = projectPages().map((page) => ({ slot: page.slot, project: page.project }));
     for (const move of pageMoves(current, currentHost, open)) {
       if (move.kind === 'reset') for (const page of projectPages()) removePage(page.slot);
       else if (move.kind === 'remove') removePage(move.slot);
       else setPage(move.project, move.slot);
     }
     currentHost = open.host;
     if (positionOfSlot(pages[activeIndex]?.slot ?? null) === -1) showPage(0);
     renderStatus();
   }
   bridge.onProjectsChange(applyProjects);
   ```

   Import `pageMoves` from `'./page-reconcile'` and `type OpenProjects` from `'./bridge'`. `activeIndex` can point past the end after removals; the `showPage(0)` line lands on the manager when the page you stood on went. Read `landOn`/`showPage` to confirm `activeIndex` is clamped there; if `showPage` already modulo-wraps (it does: `(index + pages.length) % pages.length`), pass `Math.min(activeIndex, pages.length - 1)` instead of 0.
4. `openProject` becomes:

   ```ts
   async function openProject(projectPath: string | null): Promise<void> {
     const opened = await bridge.openProject(projectPath);
     if (!opened) return showPage(activeIndex);
     applyProjects(opened.open);
     const position = positionOfSlot(opened.index);
     if (position !== -1) showPage(position);
   }
   ```

   `setPage` is unchanged; `applyProjects` is now its only caller besides itself.

- [ ] **Step 8: Checks**

```bash
npm test && npx tsc --noEmit && npx eslint . && wc -l src/main.ts
```

By hand in the app: open two projects, close one with the close key, reopen it; the tabs behave as before. Quit and relaunch: the session restores.

- [ ] **Step 9: Commit**

```bash
git add src/page-reconcile.ts src/page-reconcile.test.ts src/bridge.ts src/preload.ts src/main.ts src/renderer.ts src/log-entry.ts
git commit -m "Let main own the list of open projects and push it to every screen"
```

---

### Task 6: Settings for the host and the remote

**Files:**
- Modify: `src/settings.ts`, `src/settings.test.ts`, `src/settings-rows.ts`, `src/settings-rows.test.ts`, `src/settings-view.ts`
- Create: `src/host-token.ts`, `src/host-token.test.ts`

**Interfaces:**
- `Settings` gains
  ```ts
  host: { port: number | null; token: string };
  remote: { address: string; token: string };
  ```
  Defaults: `{ port: null, token: '' }` and `{ address: '', token: '' }`.
- `src/host-token.ts`: `export function ensureHostToken(settings: Settings, random: () => string): { settings: Settings; generated: boolean }`. Returns the same settings when the token is non-empty; otherwise a copy with `host.token = random()`.
- `settingsRows` gains, under a `Host` heading: `{ kind: 'host-port'; label: 'Port'; value: string }` (empty when null) and `{ kind: 'host-token'; label: 'Token'; value: string }`. The token row's Enter copies the token to the clipboard and says `Token copied`. No row for `remote`: the connect dialog writes it.
- `isPort(value: string): boolean`: integer 1 to 65535, exported from `settings.ts` beside `isFontSize` and used by both the parser and the screen's refusal message.

- [ ] **Step 1: Write the failing tests**

Append to `src/settings.test.ts`:

```ts
describe('host and remote', () => {
  it('defaults to no port, no token and no remote', () => {
    const settings = parseSettings({}, true);
    expect(settings.host).toEqual({ port: null, token: '' });
    expect(settings.remote).toEqual({ address: '', token: '' });
  });

  it('keeps a port in range and drops one outside it', () => {
    expect(parseSettings({ host: { port: 7777 } }, true).host.port).toBe(7777);
    expect(parseSettings({ host: { port: 0 } }, true).host.port).toBeNull();
    expect(parseSettings({ host: { port: 70000 } }, true).host.port).toBeNull();
    expect(parseSettings({ host: { port: '7777' } }, true).host.port).toBeNull();
  });

  it('keeps a token and a remote as written', () => {
    const settings = parseSettings({ host: { token: 'abc' }, remote: { address: '10.0.0.2:7777', token: 'xyz' } }, true);
    expect(settings.host.token).toBe('abc');
    expect(settings.remote).toEqual({ address: '10.0.0.2:7777', token: 'xyz' });
  });
});

describe('isPort', () => {
  it('accepts 1 to 65535 and nothing else', () => {
    expect(isPort('1')).toBe(true);
    expect(isPort('65535')).toBe(true);
    expect(isPort('0')).toBe(false);
    expect(isPort('65536')).toBe(false);
    expect(isPort('77.5')).toBe(false);
    expect(isPort('')).toBe(false);
  });
});
```

`src/host-token.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ensureHostToken } from './host-token';
import { defaultSettings } from './settings';

describe('ensureHostToken', () => {
  it('generates a token once', () => {
    const first = ensureHostToken(defaultSettings(false), () => 'fresh');
    expect(first.generated).toBe(true);
    expect(first.settings.host.token).toBe('fresh');
    const second = ensureHostToken(first.settings, () => 'again');
    expect(second.generated).toBe(false);
    expect(second.settings).toBe(first.settings);
  });
});
```

In `src/settings-rows.test.ts`, add a case: rows include `{ kind: 'heading', label: 'Host' }`, `{ kind: 'host-port', label: 'Port', value: '' }` and `{ kind: 'host-token', label: 'Token', value: 'abc' }` for `parseSettings({ host: { token: 'abc' } }, false)`, and `value: '7777'` for the port when set.

- [ ] **Step 2: Run, expect failure**

- [ ] **Step 3: Implement**

`src/settings.ts`: add the two fields to `Settings` and `defaultSettings`; add

```ts
// The same range parseSettings holds a stored port to. Exported for the settings screen's message.
export function isPort(value: string): boolean {
  const port = Number(value);
  return /^\d+$/.test(value.trim()) && port >= 1 && port <= 65535;
}
```

and in `parseSettings`:

```ts
    host: {
      port: typeof storedHost.port === 'number' && isPort(String(storedHost.port)) ? storedHost.port : null,
      token: typeof storedHost.token === 'string' ? storedHost.token : '',
    },
    remote: {
      address: typeof storedRemote.address === 'string' ? storedRemote.address.trim() : '',
      token: typeof storedRemote.token === 'string' ? storedRemote.token : '',
    },
```

with `const storedHost = asRecord(raw.host); const storedRemote = asRecord(raw.remote);`. Check `withoutDuplicates` and `resetKeys` spread the whole object so the new fields survive; `tidySettingsFile` in `settings-store.ts` writes `parseSettings`' output, so the file gains the fields on the next write.

`src/host-token.ts`:

```ts
import type { Settings } from './settings';

// The token a screen must show to join. Made the first time the host settings are read with none, and
// kept from then on, so the one pasted into the mac stays good. `random` is handed in so the rule is
// tested without crypto; main passes randomBytes(32).toString('base64url').
export function ensureHostToken(settings: Settings, random: () => string): { settings: Settings; generated: boolean } {
  if (settings.host.token !== '') return { settings, generated: false };
  return { settings: { ...settings, host: { ...settings.host, token: random() } }, generated: true };
}
```

`src/settings-rows.ts`: add the two row kinds to `SettingsRow` and, after the Weather rows:

```ts
  rows.push({ kind: 'heading', label: 'Host' });
  rows.push({ kind: 'host-port', label: 'Port', value: settings.host.port === null ? '' : String(settings.host.port) });
  rows.push({ kind: 'host-token', label: 'Token', value: settings.host.token });
```

`src/settings-view.ts`: in `startEditing`, `host-token` is not editable: add `row.kind === 'host-token'` to the early return. In `finish`, before the final `else`:

```ts
        } else if (row.kind === 'host-port') {
          // Empty means do not listen. The laptop must also be told not to sleep on lid close; that is
          // the operating system's setting, not this one.
          if (text !== '' && !isPort(text)) say(`"${text}" is not a port. Anything from 1 to 65535, or empty to stop listening.`);
          else commit({ ...settings, host: { ...settings.host, port: text === '' ? null : Number(text) } });
```

In `activate`: `if (row.kind === 'host-token') { void navigator.clipboard.writeText(row.value); return say('Token copied'); }`. Import `isPort`.

In `src/main.ts`, after `readSettings`: 

```ts
const tokenCheck = ensureHostToken(settings, () => randomBytes(32).toString('base64url'));
settings = tokenCheck.settings;
if (tokenCheck.generated) writeSettings(settingsFile, settings, isMac);
```

Import `randomBytes` from `'node:crypto'` and `ensureHostToken` from `'./host-token'`. Confirm `settings` is declared with `let`; `settings:write` already reassigns it. Watch `main.ts` length; offset by moving `processTree` out if Task 5 did not already.

- [ ] **Step 4: Checks and commit**

```bash
npm test && npx tsc --noEmit && npx eslint .
git add src/settings.ts src/settings.test.ts src/settings-rows.ts src/settings-rows.test.ts src/settings-view.ts src/host-token.ts src/host-token.test.ts src/main.ts
git commit -m "Add the host port and token and the remote address to the settings"
```

---

### Task 7: The host serves the table

**Files:**
- Create: `src/remote-host.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Produces:
  ```ts
  export type HostPorts = {
    table: Channels;
    token: () => string;
    version: string;
    onJoin(screen: string, send: (channel: string, args: unknown[]) => void): void;  // main replays rings and the project list
    onLeave(screen: string): void;                                                    // main forgets the screen's sizes
    log(draft: LogDraft): void;
  };
  export type RemoteHost = { broadcast(channel: string, args: unknown[]): void; close(): void };
  export function startRemoteHost(port: number, ports: HostPorts): RemoteHost;
  ```
- Main's `sendToRenderer` becomes a broadcast: the local window plus `remoteHost?.broadcast`. `notification:click` is the one push that stays local; it is sent from `pane-channels.ts` through `main.send`, which is `sendToRenderer`; since no remote screen ever calls `notification:show`, no remote screen is ever told to click, and the broadcast of it is harmless. Leave it.

- [ ] **Step 1: Implement `src/remote-host.ts`**

No unit test: this file is socket wiring, like `pane-channels.ts`; every decision in it is `remote-protocol.ts`'s and `channels.ts`'s, which are tested. Verified by hand in Task 10.

```ts
import { WebSocketServer, type WebSocket } from 'ws';
import type { Channels } from './channels';
import { failureText } from './failure';
import type { LogDraft } from './log-entry';
import {
  HELLO_CHANNEL, decodeFrame, encodeFrame, helloRefusal, isRequest, type Push, type Reply,
} from './remote-protocol';

// The host's side of the wire: one websocket server, one screen per connection. A connection's first
// frame must be the hello; until it passes, nothing else is read. After that every request goes into
// the channel table as that screen, and its reply goes back with the same id. A handler that throws
// answers an error frame and the socket stays open: one bad call is not a reason to drop the screen.
export type HostPorts = {
  table: Channels;
  token: () => string;
  version: string;
  onJoin(screen: string, send: (channel: string, args: unknown[]) => void): void;
  onLeave(screen: string): void;
  log(draft: LogDraft): void;
};

export type RemoteHost = { broadcast(channel: string, args: unknown[]): void; close(): void };

export function startRemoteHost(port: number, ports: HostPorts): RemoteHost {
  const server = new WebSocketServer({ port });
  const screens = new Map<string, WebSocket>();
  let nextScreen = 1;

  function push(socket: WebSocket, frame: Push | Reply): void {
    if (socket.readyState === socket.OPEN) socket.send(encodeFrame(frame));
  }

  server.on('connection', (socket, request) => {
    const address = request.socket.remoteAddress ?? 'unknown';
    const screen = `screen-${nextScreen++}@${address}`;
    let joined = false;

    socket.on('message', (raw) => {
      const frame = decodeFrame(String(raw));
      if (!frame || !isRequest(frame)) return;
      if (!joined) {
        if (frame.channel !== HELLO_CHANNEL) return socket.close(4000, 'Say hello first');
        const [token, version] = frame.args as [string, string];
        const refusal = helloRefusal(token, version, ports.token(), ports.version);
        if (refusal) {
          ports.log({ level: 'warn', kind: 'screen', message: `${address} refused: ${refusal.reason}` });
          return socket.close(refusal.code, refusal.reason);
        }
        joined = true;
        screens.set(screen, socket);
        ports.log({ level: 'info', kind: 'screen', message: `${address} joined` });
        push(socket, { id: frame.id, result: null });
        return ports.onJoin(screen, (channel, args) => push(socket, { channel, args }));
      }
      void ports.table.invoke(screen, frame.channel, frame.args)
        .then((result) => push(socket, { id: frame.id, result }))
        .catch((error: unknown) => push(socket, { id: frame.id, error: failureText(error) }));
    });

    socket.on('close', () => {
      if (!joined) return;
      screens.delete(screen);
      ports.onLeave(screen);
      ports.log({ level: 'info', kind: 'screen', message: `${address} left` });
    });
  });

  server.on('error', (error) => {
    ports.log({ level: 'error', kind: 'screen', message: `Not listening on ${port}: ${failureText(error)}` });
  });

  return {
    broadcast(channel, args) {
      for (const socket of screens.values()) push(socket, { channel, args });
    },
    close() {
      for (const socket of screens.values()) socket.close(1001, 'Host closing');
      server.close();
    },
  };
}
```

Sends (`table.on`) arrive as requests too: the client (Task 8) gives every frame an id and ignores the reply for a send. `table.invoke` on a channel registered with `on` rejects with `No such channel`; so `remote-host.ts` must route: try `invoke`, and if the table has it as a listener, `dispatch` instead. Add to `Channels` a `kind(channel): 'handle' | 'on' | undefined` and in the host:

```ts
      if (ports.table.kind(frame.channel) === 'on') {
        ports.table.dispatch(screen, frame.channel, frame.args);
        return push(socket, { id: frame.id, result: null });
      }
```

before the `invoke`. Add `kind` to `channels.ts` and a test case for it.

- [ ] **Step 2: Wire into main**

In `src/main.ts`:

```ts
let remoteHost: RemoteHost | null = null;
function sendToRenderer(channel: string, ...payload: unknown[]): void {
  liveWindow()?.webContents.send(channel, ...payload);
  remoteHost?.broadcast(channel, payload);
}
```

After `registerWithIpc(...)`, before `app.on('ready', ...)`:

```ts
if (settings.host.port !== null) {
  remoteHost = startRemoteHost(settings.host.port, {
    table,
    token: () => settings.host.token,
    version: app.getVersion(),
    onJoin(screen, send) {
      send('projects:change', [openProjects()]);
      for (const [id, ring] of rings) send('pty:data', [id, ring.replay()]);
      send('worktree:change', [worktreeList()]);
    },
    onLeave: (screen) => paneScreens.forget(screen),
    log: (draft) => logStore.log(draft),
  });
}
```

`onLeave` must also resize every shell to the remaining screens: after `forget`, `for (const [id, shell] of shells) { const size = paneScreens.sizeOf(id); if (size) shell.resize(size.cols, size.rows); }`. Put that loop in a function `resizeShellsToScreens()` in `pane-channels.ts`'s returned object if `main.ts` is tight.

In `app.on('will-quit')`: `remoteHost?.close();`.

Changing the port on the settings screen takes effect on the next launch: say so in the `host-port` row's refusal message? No, in `src/help.ts` (Task 9) and in the settings row label: `Port (next launch)`. Update the Task 6 row label and test accordingly.

- [ ] **Step 3: Checks and commit**

```bash
npm test && npx tsc --noEmit && npx eslint . && wc -l src/main.ts
git add src/remote-host.ts src/channels.ts src/channels.test.ts src/main.ts src/pane-channels.ts src/settings-rows.ts src/settings-rows.test.ts
git commit -m "Serve the session to remote screens over a websocket"
```

---

### Task 8: The client relays to the host

**Files:**
- Create: `src/remote-client.ts`, `src/remote-client.test.ts`, `src/pending-requests.ts`, `src/pending-requests.test.ts`
- Modify: `src/bridge.ts`, `src/preload.ts`, `src/main.ts`

**Interfaces:**
- `src/pending-requests.ts` (pure, tested):
  ```ts
  export type Pending = {
    open(id: number, resolve: (value: unknown) => void, reject: (error: Error) => void): void;
    settle(reply: Reply): boolean;        // false when nobody waits for that id
    expire(id: number, address: string): void;   // rejects with `No answer from <address>`
    failAll(reason: string): void;
  };
  export function pendingRequests(): Pending;
  ```
- `src/remote-client.ts`:
  ```ts
  export type ClientPorts = {
    version: string;
    push(channel: string, args: unknown[]): void;     // to the renderer
    status(text: string): void;                       // the status bar line; '' clears
    log(draft: LogDraft): void;
  };
  export type RemoteClient = RemoteTarget & { address: string; close(): void };
  export function connectRemote(address: string, token: string, ports: ClientPorts): Promise<RemoteClient>;  // resolves after the hello is accepted; rejects with the refusal reason
  ```
  After the first accepted hello, a drop starts a reconnect every 2 seconds; `status('Reconnecting to <address>…')` while down, `status('')` when back. Each successful reconnect sends the hello again and the host replays (Task 7's `onJoin`). Requests made while down reject at once with `Not connected to <address>`; sends while down are dropped.
- Bridge: `connectHost(address: string, token: string): Promise<string>` (resolves `''` or a refusal message), `disconnectHost(): Promise<void>`, `onHostStatus(listener: (text: string) => void): void` (channel `host:status`). Channels `host:connect`, `host:disconnect`.

- [ ] **Step 1: Write the failing test for pending requests**

```ts
import { describe, expect, it } from 'vitest';
import { pendingRequests } from './pending-requests';

describe('pendingRequests', () => {
  it('settles a reply by id with its result', async () => {
    const pending = pendingRequests();
    const answer = new Promise((resolve, reject) => pending.open(1, resolve, reject));
    expect(pending.settle({ id: 1, result: 'ok' })).toBe(true);
    await expect(answer).resolves.toBe('ok');
  });

  it('rejects an error reply with the host\'s text', async () => {
    const pending = pendingRequests();
    const answer = new Promise((resolve, reject) => pending.open(2, resolve, reject));
    pending.settle({ id: 2, error: 'disk full' });
    await expect(answer).rejects.toThrow('disk full');
  });

  it('says so when nobody waits for the id', () => {
    expect(pendingRequests().settle({ id: 9, result: null })).toBe(false);
  });

  it('expires a request naming the host', async () => {
    const pending = pendingRequests();
    const answer = new Promise((resolve, reject) => pending.open(3, resolve, reject));
    pending.expire(3, '10.0.0.2:7777');
    await expect(answer).rejects.toThrow('No answer from 10.0.0.2:7777');
    expect(pending.settle({ id: 3, result: null })).toBe(false);
  });

  it('fails everything open when the socket goes', async () => {
    const pending = pendingRequests();
    const first = new Promise((resolve, reject) => pending.open(4, resolve, reject));
    const second = new Promise((resolve, reject) => pending.open(5, resolve, reject));
    pending.failAll('Lost the host');
    await expect(first).rejects.toThrow('Lost the host');
    await expect(second).rejects.toThrow('Lost the host');
  });
});
```

- [ ] **Step 2: Run, expect failure. Implement**

```ts
import type { Reply } from './remote-protocol';

// Requests out on the wire with no reply yet. Settled by id when the reply comes, expired by the
// client's timer, failed together when the socket drops; a request never waits forever, so no dialog
// hangs on a wifi that went away.
export type Pending = {
  open(id: number, resolve: (value: unknown) => void, reject: (error: Error) => void): void;
  settle(reply: Reply): boolean;
  expire(id: number, address: string): void;
  failAll(reason: string): void;
};

export function pendingRequests(): Pending {
  const waiting = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  return {
    open(id, resolve, reject) { waiting.set(id, { resolve, reject }); },
    settle(reply) {
      const entry = waiting.get(reply.id);
      if (!entry) return false;
      waiting.delete(reply.id);
      if (reply.error !== undefined) entry.reject(new Error(reply.error));
      else entry.resolve(reply.result);
      return true;
    },
    expire(id, address) {
      const entry = waiting.get(id);
      if (!entry) return;
      waiting.delete(id);
      entry.reject(new Error(`No answer from ${address}`));
    },
    failAll(reason) {
      for (const entry of waiting.values()) entry.reject(new Error(reason));
      waiting.clear();
    },
  };
}
```

Run: PASS.

- [ ] **Step 3: Write the failing test for the client, against a real `ws` server on a free port**

`src/remote-client.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocketServer } from 'ws';
import { connectRemote, type RemoteClient } from './remote-client';
import { decodeFrame, encodeFrame, isRequest } from './remote-protocol';

let server: WebSocketServer | undefined;
let client: RemoteClient | undefined;
afterEach(() => { client?.close(); server?.close(); });

function hostOn(answer: (channel: string, args: unknown[]) => unknown): Promise<string> {
  return new Promise((resolve) => {
    server = new WebSocketServer({ port: 0 }, () => {
      const address = server!.address();
      resolve(typeof address === 'string' ? address : `127.0.0.1:${address.port}`);
    });
    server.on('connection', (socket) => {
      socket.on('message', (raw) => {
        const frame = decodeFrame(String(raw));
        if (!frame || !isRequest(frame)) return;
        if (frame.channel === 'host:hello') {
          if (frame.args[0] !== 'good') return socket.close(4001, 'The host refused the token');
          return socket.send(encodeFrame({ id: frame.id, result: null }));
        }
        socket.send(encodeFrame({ id: frame.id, result: answer(frame.channel, frame.args) }));
      });
    });
  });
}

const ports = () => ({ version: '1.17.0', push: () => undefined, status: () => undefined, log: () => undefined });

describe('connectRemote', () => {
  it('connects, then forwards a request and brings back its result', async () => {
    const address = await hostOn((channel, args) => `${channel}:${String(args[0])}`);
    client = await connectRemote(address, 'good', ports());
    await expect(client.invoke('board:read', ['/code/api'])).resolves.toBe('board:read:/code/api');
  });

  it('rejects with the host\'s reason when the token is wrong', async () => {
    const address = await hostOn(() => null);
    await expect(connectRemote(address, 'bad', ports())).rejects.toThrow('The host refused the token');
  });

  it('relays a push to the renderer', async () => {
    const pushed: unknown[] = [];
    const address = await hostOn(() => null);
    client = await connectRemote(address, 'good', { ...ports(), push: (channel, args) => pushed.push([channel, args]) });
    for (const socket of server!.clients) socket.send(encodeFrame({ channel: 'pty:data', args: ['0-1', 'hi'] }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(pushed).toEqual([['pty:data', ['0-1', 'hi']]]);
  });

  it('times out a request the host never answers', async () => {
    const address = await hostOn(() => null);
    client = await connectRemote(address, 'good', ports());
    for (const socket of server!.clients) socket.removeAllListeners('message');
    await expect(client.invoke('board:read', [], 20)).rejects.toThrow(`No answer from ${address}`);
  });
});
```

`invoke(channel, args, timeoutMs = REQUEST_TIMEOUT_MS)`: the third parameter exists for this test.

- [ ] **Step 4: Implement `src/remote-client.ts`**

```ts
import WebSocket from 'ws';
import type { RemoteTarget } from './channels';
import type { LogDraft } from './log-entry';
import { pendingRequests } from './pending-requests';
import {
  HELLO_CHANNEL, REQUEST_TIMEOUT_MS, decodeFrame, encodeFrame, isReply, type Frame,
} from './remote-protocol';

// This screen's side of the wire. One socket to the host; every request gets an id and a timer, every
// push goes to the renderer as if main had sent it. A socket that drops after the first accepted hello
// is retried every two seconds, and the host replays each pane on the way back in.
export type ClientPorts = {
  version: string;
  push(channel: string, args: unknown[]): void;
  status(text: string): void;
  log(draft: LogDraft): void;
};

export type RemoteClient = RemoteTarget & {
  address: string;
  invoke(channel: string, args: unknown[], timeoutMs?: number): Promise<unknown>;
  close(): void;
};

const RECONNECT_MS = 2_000;

export function connectRemote(address: string, token: string, ports: ClientPorts): Promise<RemoteClient> {
  const pending = pendingRequests();
  let socket: WebSocket | null = null;
  let nextId = 1;
  let closed = false;
  let reconnectTimer: NodeJS.Timeout | null = null;

  function send(frame: Frame): boolean {
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(encodeFrame(frame));
    return true;
  }

  function request(channel: string, args: unknown[], timeoutMs: number): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      if (!send({ id, channel, args })) return reject(new Error(`Not connected to ${address}`));
      pending.open(id, resolve, reject);
      setTimeout(() => pending.expire(id, address), timeoutMs).unref();
    });
  }

  // Opens a socket and says hello. Resolves once the host accepts; rejects with the host's reason.
  function open(): Promise<void> {
    return new Promise((resolve, reject) => {
      const next = new WebSocket(`ws://${address}`);
      let accepted = false;
      next.on('open', () => {
        socket = next;
        request(HELLO_CHANNEL, [token, ports.version], REQUEST_TIMEOUT_MS).then(() => {
          accepted = true;
          ports.status('');
          resolve();
        }, reject);
      });
      next.on('message', (raw) => {
        const frame = decodeFrame(String(raw));
        if (!frame) return;
        if (isReply(frame)) pending.settle(frame);
        else if ('channel' in frame) ports.push(frame.channel, frame.args);
      });
      next.on('error', (error) => { if (!accepted) reject(error); });
      next.on('close', (code, reason) => {
        if (socket === next) socket = null;
        pending.failAll(`Lost ${address}`);
        if (!accepted) return reject(new Error(reason.toString() || `Could not reach ${address}`));
        if (closed) return;
        ports.status(`Reconnecting to ${address}…`);
        reconnectTimer = setTimeout(() => void open().catch(() => undefined), RECONNECT_MS);
      });
    });
  }

  return open().then(() => ({
    address,
    invoke: (channel, args, timeoutMs = REQUEST_TIMEOUT_MS) => request(channel, args, timeoutMs),
    send(channel, args) {
      // Dropped when down, never queued: a queued `rm` landing a minute late is worse than a lost key.
      send({ id: nextId++, channel, args });
    },
    close() {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close(1000, 'Disconnected');
      ports.status('');
    },
  }));
}
```

A `send` is sent as a request so the host's single path handles it; its reply is never waited for (`pending.open` is not called), so `settle` returns false and nothing else happens.

- [ ] **Step 5: Run, expect pass**

Run: `npx vitest run src/remote-client.test.ts src/pending-requests.test.ts`

- [ ] **Step 6: Bridge, preload, main**

`src/bridge.ts`:

```ts
  connectHost(address: string, token: string): Promise<string>;
  disconnectHost(): Promise<void>;
  onHostStatus(listener: (text: string) => void): void;
```

`src/preload.ts`:

```ts
  connectHost: (address, token) => ipcRenderer.invoke('host:connect', address, token),
  disconnectHost: () => ipcRenderer.invoke('host:disconnect'),
  onHostStatus: (listener) => ipcRenderer.on('host:status', (_event, text) => listener(text)),
```

Create `src/remote-ipc.ts` (main-process wiring, no test, like `log-ipc.ts`):

```ts
import type { Channels, RemoteTarget } from './channels';
import { failureText } from './failure';
import type { LogDraft } from './log-entry';
import { connectRemote, type RemoteClient } from './remote-client';
import type { Settings } from './settings';

// The two channels that turn this app into a screen of another host and back. The live client is
// what registerWithIpc asks for on every call; while it is set, every non-local channel goes to it.
export function registerRemote(table: Channels, ports: {
  version: string;
  send(channel: string, ...payload: unknown[]): void;
  settings(): Settings;
  saveSettings(next: Settings): void;
  log(draft: LogDraft): void;
  localProjects(): unknown;    // what projects:change carries when the client goes back to its own session
}): { current(): RemoteTarget | null } {
  let client: RemoteClient | null = null;

  table.handle('host:connect', async (_screen, address: string, token: string): Promise<string> => {
    client?.close();
    client = null;
    try {
      client = await connectRemote(address, token, {
        version: ports.version,
        push: (channel, args) => ports.send(channel, ...args),
        status: (text) => ports.send('host:status', text),
        log: ports.log,
      });
    } catch (error: unknown) {
      return failureText(error);
    }
    ports.saveSettings({ ...ports.settings(), remote: { address, token } });
    ports.log({ level: 'info', kind: 'screen', message: `connected to ${address}` });
    return '';
  });

  table.handle('host:disconnect', () => {
    if (!client) return;
    ports.log({ level: 'info', kind: 'screen', message: `disconnected from ${client.address}` });
    client.close();
    client = null;
    ports.send('projects:change', ports.localProjects());
  });

  return { current: () => client };
}
```

In `src/main.ts`:

```ts
const remote = registerRemote(table, {
  version: app.getVersion(),
  send: sendToRenderer,
  settings: () => settings,
  saveSettings(next) { settings = next; writeSettings(settingsFile, settings, isMac); },
  log: (draft) => logStore.log(draft),
  localProjects: openProjects,
});
registerWithIpc(table, remote.current);
```

`host:connect`'s `connectRemote` succeeding makes the host push `projects:change` with its list (Task 7's `onJoin`), which the renderer applies with a `reset` because the host differs. On `host:disconnect`, the local list goes out with host `local` and the renderer resets back.

`--remote` at launch: in `app.on('ready')`, after `createWindow()`:

```ts
  if (process.argv.includes('--remote') && settings.remote.address !== '') {
    mainWindow.webContents.once('did-finish-load', () => {
      void table.invoke(LOCAL_SCREEN, 'host:connect', [settings.remote.address, settings.remote.token])
        .then((refusal) => { if (refusal) failures.hold(String(refusal)); });
    });
  }
```

Watch `main.ts` length; it must not grow. Move `processTree` out (Task 5 note) if not yet done, and move the `remoteHost` start block of Task 7 into `remote-ipc.ts` as a second exported function `startHostIfConfigured` if still needed.

- [ ] **Step 7: Checks and commit**

```bash
npm test && npx tsc --noEmit && npx eslint . && wc -l src/main.ts
git add src/pending-requests.ts src/pending-requests.test.ts src/remote-client.ts src/remote-client.test.ts src/remote-ipc.ts src/bridge.ts src/preload.ts src/main.ts
git commit -m "Relay every channel to a remote host once a screen has connected"
```

---

### Task 9: The picker's connect rows and the renderer's connect flow

**Files:**
- Modify: `src/picker.ts`, `src/picker.test.ts`, `src/renderer.ts:543-565`, `src/help.ts:287-300`, `src/main.ts:575-580` (`projects:open` with null from a remote screen)

**Interfaces:**
- `PickerChoice` becomes
  ```ts
  export type PickerChoice =
    | { kind: 'open'; path: string | null }
    | { kind: 'connect' }
    | { kind: 'reconnect'; address: string }
    | { kind: 'disconnect'; address: string }
    | undefined;
  export type PickerState = { connectedTo: string | null; lastAddress: string };
  export function pickerRows(projects: Project[], query: string, state: PickerState): Row[];
  export function openPicker(projects: Project[], state: PickerState): Promise<PickerChoice>;
  ```
  Rows after the matches, in order: the new-project row; then when `connectedTo` is set, `Disconnect from <address>`; otherwise `Connect to a host…` and, when `lastAddress` is non-empty, `Reconnect to <lastAddress>` before it.

- [ ] **Step 1: Update the tests**

In `src/picker.test.ts`, every `pickerRows(a, b)` call gains `{ connectedTo: null, lastAddress: '' }`, and `row.choice` comparisons change from a path to `{ kind: 'open', path }` (`toBeNull()` becomes `toEqual({ kind: 'open', path: null })`). Add:

```ts
describe('connect rows', () => {
  const none = { connectedTo: null, lastAddress: '' };

  it('offers to connect when not connected', () => {
    const rows = pickerRows([], '', none);
    expect(rows.map((row) => row.choice)).toEqual([{ kind: 'open', path: null }, { kind: 'connect' }]);
  });

  it('offers the last host first when there is one', () => {
    const rows = pickerRows([], '', { connectedTo: null, lastAddress: '10.0.0.2:7777' });
    expect(rows.map((row) => row.choice)).toEqual([
      { kind: 'open', path: null }, { kind: 'reconnect', address: '10.0.0.2:7777' }, { kind: 'connect' },
    ]);
  });

  it('offers only to disconnect while connected', () => {
    const rows = pickerRows([], '', { connectedTo: '10.0.0.2:7777', lastAddress: '10.0.0.2:7777' });
    expect(rows.map((row) => row.choice)).toEqual([{ kind: 'open', path: null }, { kind: 'disconnect', address: '10.0.0.2:7777' }]);
  });

  it('keeps the host rows whatever the search says', () => {
    const rows = pickerRows([project('api', '/code/api')], 'zzz', none);
    expect(rows.map((row) => row.choice)).toEqual([{ kind: 'open', path: null }, { kind: 'connect' }]);
  });
});
```

- [ ] **Step 2: Run, expect failure. Implement `src/picker.ts`**

```ts
export type PickerChoice =
  | { kind: 'open'; path: string | null }
  | { kind: 'connect' }
  | { kind: 'reconnect'; address: string }
  | { kind: 'disconnect'; address: string }
  | undefined;
export type PickerState = { connectedTo: string | null; lastAddress: string };
export type Row = SearchRow<Exclude<PickerChoice, undefined>>;

const NEW_PROJECT: Row = { name: 'Open a new project…', detail: 'choose a folder', choice: { kind: 'open', path: null }, className: 'picker-new' };
const CONNECT: Row = { name: 'Connect to a host…', detail: 'another Dashboard, as a second screen', choice: { kind: 'connect' }, className: 'picker-new' };

// The rows that are not projects, always present and always last, so a search that matches nothing still
// leaves something to press Enter on. One host at a time: connected, the only host row is the way out.
function hostRows(state: PickerState): Row[] {
  if (state.connectedTo !== null) {
    return [{ name: `Disconnect from ${state.connectedTo}`, detail: 'back to this machine\'s projects', choice: { kind: 'disconnect', address: state.connectedTo }, className: 'picker-new' }];
  }
  const rows: Row[] = [];
  if (state.lastAddress !== '') {
    rows.push({ name: `Reconnect to ${state.lastAddress}`, detail: 'the host you last connected to', choice: { kind: 'reconnect', address: state.lastAddress }, className: 'picker-new' });
  }
  return [...rows, CONNECT];
}

export function pickerRows(projects: Project[], query: string, state: PickerState): Row[] {
  const matched = /* unchanged, but choice: { kind: 'open', path: entry.project.path } */;
  return [...matched, NEW_PROJECT, ...hostRows(state)];
}

export function openPicker(projects: Project[], state: PickerState): Promise<PickerChoice> {
  return searchOverlay({
    name: 'picker',
    placeholder: 'Search projects',
    rows: (query) => pickerRows(projects, query, state),
    glyph: (row) => (row.choice.kind === 'open' && row.choice.path === null ? 'folderPlus'
      : row.choice.kind === 'open' ? 'folder' : 'plug'),
  });
}
```

Check `lucide` has a `plug` icon under the name the glyph helper expects (grep the glyph map in `src/icons.ts` or wherever `'folderPlus'` is resolved); if not, use `'link'`.

- [ ] **Step 3: Renderer flow**

In `src/renderer.ts`, `showPicker`:

```ts
async function showPicker(): Promise<void> {
  const recent = currentHost === 'local' ? await bridge.getRecentProjects() : await bridge.getRecentProjects();
  // Both branches ask the same bridge call: while connected it is relayed, so the list is the host's.
  const byPath = new Map<string, Project>();
  for (const page of projectPages()) if (!page.project.missing) byPath.set(page.project.path, page.project);
  for (const project of recent) if (!byPath.has(project.path)) byPath.set(project.path, project);
  const choice = await openPicker([...byPath.values()], {
    connectedTo: currentHost === 'local' ? null : currentHost,
    lastAddress: settings.remote.address,
  });
  if (choice === undefined) return showPage(activeIndex);
  if (choice.kind === 'open') return openProject(choice.path);
  if (choice.kind === 'disconnect') { await bridge.disconnectHost(); return showPage(activeIndex); }
  const address = choice.kind === 'reconnect' ? choice.address
    : await promptOverlay('Host address', settings.remote.address, '192.168.1.20:7777', 'Enter connects, Escape keeps you here');
  if (address === null || address.trim() === '') return showPage(activeIndex);
  const token = choice.kind === 'reconnect' ? settings.remote.token
    : await promptOverlay('Host token', '', 'from the host\'s settings screen', 'Enter connects, Escape keeps you here');
  if (token === null) return showPage(activeIndex);
  const refusal = await bridge.connectHost(address.trim(), token);
  if (refusal !== '') showNotice('host', refusal);
  else settings = { ...settings, remote: { address: address.trim(), token } };
  showPage(activeIndex);
}
```

Collapse the first line to one `await bridge.getRecentProjects()`; the comment explains why no branch. `bridge.onHostStatus((text) => showNotice('host', text));` beside the other listeners. Check `showNotice(span, text)`'s signature in `renderer.ts` and that an empty text clears the span.

Opening a new project while connected: `openProject(null)` would open a folder dialog on the host's desk. In `openProject`, before the bridge call:

```ts
  if (projectPath === null && currentHost !== 'local') {
    const typed = await promptOverlay(`Folder on ${currentHost}`, '', '/home/you/code/project', 'Enter opens it, Escape keeps you here');
    if (typed === null || typed.trim() === '') return showPage(activeIndex);
    projectPath = typed.trim();
  }
```

And in `main.ts`'s `projects:open`, the dialog branch refuses a remote screen so a stray null can never raise a dialog on the desk:

```ts
  if (projectPath === null) {
    if (screen !== LOCAL_SCREEN) throw new Error('Type the folder\'s path on the host');
    ...
```

(The handler's first parameter is now `screen`, not `_screen`.)

- [ ] **Step 4: Help**

In `src/help.ts`, the `projects` blurb gains, after the sentence about the window opening on the last run's projects:

```
'The project list has one more row at the bottom, Connect to a host: another Dashboard, on another machine, that has a port and a token in its settings. Connected, this window is a second screen of that session — its projects, its shells, its boards — and the row becomes Disconnect. Opening a new project while connected asks for a folder path on the host, since a folder dialog here would show this machine\'s disk. '
```

And the settings screen blurb (find the `settings:` entry) gains: `'The Host rows make this Dashboard reachable from another: a port, read at the next launch, and the token the other machine pastes once. The laptop must not sleep on lid close; that is the operating system\'s setting.'`

- [ ] **Step 5: Checks**

```bash
npm test && npx tsc --noEmit && npx eslint . && wc -l src/main.ts src/renderer.ts
```

`renderer.ts` is already over 600 lines (check `wc -l`); if it is, the `showPicker` growth must be offset: move `showPicker` and the connect prompts into a new `src/connect-flow.ts` exporting `showPicker(ports)` with the pieces it needs (`projectPages`, `openProject`, `settings` getter and setter, `currentHost`, `showPage`, `showNotice`) handed in.

- [ ] **Step 6: Commit**

```bash
git add src/picker.ts src/picker.test.ts src/renderer.ts src/help.ts src/main.ts
git commit -m "Connect to a host from the project list and open the host's folders by path"
```

---

### Task 10: Version, documentation, hand check

**Files:**
- Modify: `package.json` (`version`), `README.md` (an `Second screen` section), `docs/decisions.md` (one entry), `.dashboard/board.json` through the `board` command only

- [ ] **Step 1: Version**

`package.json` `version`: `1.16.0` → `1.17.0`. Run `npm install` so the lockfile's own version line follows.

- [ ] **Step 2: README**

Add under the existing Install or Settings section:

```markdown
## Second screen

One Dashboard can show another's session. On the machine that holds the work, set a port in the
settings screen under Host and copy the token from the row below it; the port is read at the next
launch. On the other machine, open the project list (Ctrl+S) and choose Connect to a host, then type
`address:port` and paste the token. From then on that window is a second screen of the first: the same
shells, boards and notes, with its own selected pane and mode. Each shell is sized to the smaller of
the two windows. Choose Disconnect in the same list to come back to the machine's own projects.
Launch with `--remote` to connect to the last host straight away.

The wire is plain text, guarded by the token. It is meant for a home network; a token in the wrong
hands is a shell as you. The host must not sleep on lid close; that is the operating system's setting.
```

- [ ] **Step 3: decisions.md**

Add:

```markdown
## The host owns the list of open projects

Two screens can open and close projects, so the renderer no longer decides what is open. Main does, and
pushes `projects:change` with the whole list; each renderer makes its pages match through
`pageMoves` in `page-reconcile.ts`. The reply to a renderer's own `projects:open` carries the same
list, so the push and the reply are idempotent whichever lands first. Settings stay on the screen that
shows them: a mac on a Linux host keeps its Cmd keys.
```

- [ ] **Step 4: Full checks**

```bash
npm test && npx tsc --noEmit && npx eslint .
grep -rn "createElement('input')\|createElement('textarea')" src/ | wc -l
grep -rn "dir = 'auto'" src/ | wc -l
grep -rn "String(error)" src/ | grep -v 'failure.ts\|board-cli.ts\|board-view.ts\|notes-view.ts'
```

The two counts agree; the last grep prints nothing.

- [ ] **Step 5: Hand check with two instances on one machine**

Do not touch the installed app. Build into `out/` with `npm run package` only if the forge config permits a second instance; otherwise run two dev instances:

```bash
# terminal 1: host, with a settings file naming a port
XDG_CONFIG_HOME=/tmp/dashboard-host npm start
# set Host > Port to 7777 in its settings screen, note the token, quit it, start it again
# terminal 2: client
XDG_CONFIG_HOME=/tmp/dashboard-client npm start
```

Check `settingsFilePath(home, xdgConfigHome)` in `settings-store.ts` honours `XDG_CONFIG_HOME`; if it does not on Linux, use `HOME=/tmp/dashboard-client` instead.

In the client: Ctrl+S, Connect to a host, `127.0.0.1:7777`, token. Expect: the host's tabs appear, every pane shows its current screen. Type in a pane on each side; both show it. Resize the client narrower; the host's pane reflows. Open a project from the client by path; it appears on the host. Close one on the host; it disappears on the client. Kill the host (Ctrl+C in terminal 1): client status bar reads `Reconnecting to 127.0.0.1:7777…`; start the host again: panes clear and replay. Wrong token: `The host refused the token`. Disconnect: the client's own projects return.

- [ ] **Step 6: Commit, push, pull request, board**

```bash
git add package.json package-lock.json README.md docs/decisions.md
git commit -m "Bump to 1.17.0 and document the second screen"
git push -u origin remote-host
gh pr create --title "A second screen: connect one Dashboard to another's session" --body "$(cat <<'EOF'
The laptop's Dashboard serves its session over a websocket; another Dashboard connects from the project list and becomes a second screen of the same shells, boards and notes.

Spec: docs/superpowers/specs/2026-10-28-remote-host-design.md
Plan: docs/superpowers/plans/2026-10-28-remote-host.md

- One channel table in main, dispatched by ipcMain and by the websocket, each call tagged with its screen
- Main owns the list of open projects and pushes it; the renderer reconciles its pages
- Shells sized to the smallest screen; a 256 KB ring per pane replays to a joining screen
- Settings: Host port and token; the client remembers the last address
- Picker rows: Connect, Reconnect, Disconnect; a folder path prompt while connected
EOF
)"
node "$DASHBOARD_BOARD" move cb8ff4a0 Review
node "$DASHBOARD_BOARD" set cb8ff4a0 --branch remote-host --pull-request <number>
```

Commit the board change straight to `main` in a temporary worktree of `origin/main`, never on the feature branch.

Then say the installed app needs a rebuild and restart, and stop.
