import type { HookCallbackMatcher, Options } from '@anthropic-ai/claude-agent-sdk';
import { readFileSync } from 'node:fs';
import type { WorkerState } from '../../shared/app/bridge';
import type { ChatEvent } from '../../shared/chat/chat-transcript';
import { isRecord } from '../../shared/app/is-record';
import { paneFromId, terminalId } from '../../shared/panes/terminals';
import { screenKey } from '../../shared/workers/screen-key';
import type { StopWaiting } from '../../shared/workers/worker-roster';
import { replaceFile } from '../app/replace-file';
import type { ScreenSession } from '../chat/chat-sessions';
import { stopWaiting } from './session-cli';
import type { ScreenHost } from './screen-host-client';

// Worker panes run as Claude screens: `pane run --screen`. The pane keeps its shell, hidden, and the
// renderer draws a Claude screen over it, run by chat-sessions.ts under the pane's screen key the way a
// page's main runs under its slot. Its turns are reported by the session's own hooks, called in this
// process, where a terminal worker's run `session notify`: the Stop hook's input says what the session
// still waits on, as PR #211 reads it from stdin. A question waiting on you is the screen's own ask.
//
// Each one is written to screen-workers.json by project and pane number, so a restart opens the pane
// again on the same conversation, as main's worker, once its project opens.

export type ScreenStart = { session: string; name: string; prompt: string };

// `started` is whether the session has written its conversation, so a restart resumes it rather than
// starting it fresh. A file from before it was saved names none, and was resumed then too.
type Saved = {
  projectPath: string; index: number; directory: string; session: string; name: string;
  dispatcherPath: string; cardId: string | null; started?: boolean;
};

// What chat-sessions runs it on, beside what is saved of it and whether its last turn has ended.
type Worker = ScreenSession & { id: string; saved: Saved; done: boolean };

export type ScreenPorts = {
  file: string;
  // The pages' panes changed: every screen redraws them, this one now drawn as a Claude screen.
  changed(): void;
  // A message into the session under the key, which starts it: the worker's first prompt.
  tell(key: number, text: string): void;
  stop(key: number): void;
  // Starts the session under the key, which takes up one the screen host kept.
  start(key: number): void;
  // Where the sessions run, and which ones it kept through the restart (screen-host-client.ts).
  host: ScreenHost;
  notify(id: string, state: WorkerState, waiting?: StopWaiting): void;
};

// What a screen event says about its worker: a question waiting on you, the question gone, the
// session's conversation written, which is what a later start resumes rather than starts fresh, or its
// turn over. The Stop hook does not run for a turn you interrupt or a session that dies, and the SDK's
// result and the session's end come either way; they end the turn without telling main anything.
export function screenSignal(event: ChatEvent): WorkerState | 'started' | 'turn-over' | null {
  if (event.kind === 'ask') return 'blocked';
  if (event.kind === 'ask-gone') return 'running';
  if (event.kind === 'ended') return 'turn-over';
  if (event.kind !== 'message') return null;
  if (event.message.type === 'result') return 'turn-over';
  if (event.message.type === 'system' && event.message.subtype === 'init') return 'started';
  return null;
}

// A file that is missing or not what this app wrote holds nobody to bring back.
export function savedScreens(file: string): Saved[] {
  try {
    const read: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(read) ? read.filter((each): each is Saved => (
      isRecord(each) && typeof each.projectPath === 'string' && typeof each.index === 'number'
      && typeof each.directory === 'string' && typeof each.session === 'string' && typeof each.name === 'string'
      && typeof each.dispatcherPath === 'string' && (each.cardId === null || typeof each.cardId === 'string')
      && (each.started === undefined || typeof each.started === 'boolean')
    )) : [];
  } catch {
    return [];
  }
}

export function screenWorkers(ports: ScreenPorts) {
  const live = new Map<string, Worker>();
  // The same workers by screen key, which every chat event and request names.
  const byKey = new Map<number, Worker>();
  // Saved by a run before this launch, until its project opens.
  let waiting = savedScreens(ports.file);

  function save(): void {
    const kept = [...live.values()].map((worker) => worker.saved);
    try {
      replaceFile(ports.file, JSON.stringify([...kept, ...waiting], null, 2));
    } catch {
      // ponytail: a write that fails costs the worker's return after a restart and nothing else.
    }
  }

  // The worker's hooks, beside whatever the user's settings hold, saying what a terminal worker's
  // workerSettings hooks say. A permission prompt is the screen's ask, which screenSignal reads.
  function report(id: string, state: WorkerState, waiting?: StopWaiting): void {
    const worker = live.get(id);
    if (worker) worker.done = state === 'done';
    ports.notify(id, state, waiting);
  }

  function hooks(id: string): Options['hooks'] {
    const reporting = (state: WorkerState): HookCallbackMatcher[] => [{ hooks: [async () => {
      report(id, state);
      return {};
    }] }];
    return {
      Stop: [{ hooks: [async (input) => {
        report(id, 'done', stopWaiting(input));
        return {};
      }] }],
      UserPromptSubmit: reporting('running'),
      PostToolUse: reporting('running'),
    };
  }

  // One brought back after a restart had its turn ended by the restart, unless the screen host kept it
  // in the middle of one.
  function add(id: string, saved: Saved, back: boolean): void {
    const resume = back && saved.started !== false;
    const done = back && ports.host.kept(saved.session)?.busy !== true;
    const worker = { session: saved.session, name: saved.name, resume, hooks: hooks(id), id, saved, done };
    live.set(id, worker);
    byKey.set(screenKey(id), worker);
  }

  return {
    host: ports.host,
    start(id: string, projectPath: string, directory: string, screen: ScreenStart, cardId: string | null, dispatcherPath: string): void {
      const { index } = paneFromId(id);
      add(id, { projectPath, index, directory, session: screen.session, name: screen.name, dispatcherPath, cardId, started: false }, false);
      save();
      // Drawn first, so the screen is there for the prompt to land on.
      ports.changed();
      ports.tell(screenKey(id), screen.prompt);
    },
    has: (id: string): boolean => live.has(id),
    // `pane send` to a worker screen: the text as its next prompt. False for a pane that is not one.
    send(id: string, text: string): boolean {
      if (!live.has(id)) return false;
      ports.tell(screenKey(id), text);
      return true;
    },
    // Whether the worker is at work, for a sweep that would take its worktree: until its turn ends.
    // Undefined for a pane that is not a worker screen.
    working(id: string): boolean | undefined {
      const worker = live.get(id);
      return worker && !worker.done;
    },
    ids: (): string[] => [...live.keys()],
    // The pane whose screen runs this conversation, which nothing else running Claude can see.
    paneRunning: (session: string): string | undefined => [...live.values()].find((worker) => worker.session === session)?.id,
    directoryOf: (key: number): string | undefined => byKey.get(key)?.saved.directory,
    // Where the worker works, which is not where the hidden shell under it stands.
    folder: (id: string): string | undefined => live.get(id)?.saved.directory,
    session: (key: number): ScreenSession | undefined => byKey.get(key),
    // Called on every event of every session, a streamed token included, so the cheap test goes first.
    observe(key: number, event: ChatEvent): void {
      const signal = screenSignal(event);
      const worker = signal && byKey.get(key);
      if (!worker) return;
      if (signal === 'turn-over') worker.done = true;
      else if (signal !== 'started') report(worker.id, signal);
      else if (!worker.resume) {
        worker.resume = true;
        worker.saved.started = true;
        save();
      }
    },
    // The pane closed or released: the session goes with it.
    drop(id: string): void {
      if (!live.delete(id)) return;
      byKey.delete(screenKey(id));
      ports.stop(screenKey(id));
      save();
    },
    // The project opened in `slot`: the workers saved for it, back under this slot's pane ids, each to
    // be opened as main's worker again. Their sessions start when shown or told something, except one
    // the screen host kept, taken up at once so what it did while the app was away is heard.
    comeBack(slot: number, projectPath: string): Saved[] {
      const back = waiting.filter((saved) => saved.projectPath === projectPath);
      waiting = waiting.filter((saved) => saved.projectPath !== projectPath);
      for (const saved of back) {
        const id = terminalId(slot, saved.index);
        add(id, saved, true);
        if (ports.host.kept(saved.session)) ports.start(screenKey(id));
      }
      if (back.length > 0) save();
      return back;
    },
  };
}
