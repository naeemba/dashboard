import type { HookCallbackMatcher, Options } from '@anthropic-ai/claude-agent-sdk';
import { readFileSync } from 'node:fs';
import type { WorkerState } from '../../shared/app/bridge';
import type { ChatEvent } from '../../shared/chat/chat-transcript';
import { isRecord } from '../../shared/app/is-record';
import { paneFromId, terminalId } from '../../shared/panes/terminals';
import { screenKey } from '../../shared/workers/screen-key';
import type { StopWaiting } from '../../shared/workers/worker-roster';
import { replaceFile } from '../board/board-store';
import type { ScreenSession } from '../chat/chat-sessions';
import { stopWaiting } from './session-cli';

// Worker panes run as Claude screens: `pane run --screen`. The pane keeps its shell, hidden, and the
// renderer draws a Claude screen over it, run by chat-sessions.ts under the pane's screen key the way a
// page's main runs under its slot. Its turns are reported by the session's own hooks, called in this
// process, where a terminal worker's run `session notify`: the Stop hook's input says what the session
// still waits on, as PR #211 reads it from stdin. A question waiting on you is the screen's own ask.
//
// Each one is written to screen-workers.json by project and pane number, so a restart opens the pane
// again on the same conversation, as main's worker, once its project opens.

export type ScreenStart = { session: string; name: string; prompt: string };

type Saved = {
  projectPath: string; index: number; directory: string; session: string; name: string;
  dispatcherPath: string; cardId: string | null;
};

type Worker = Saved & { id: string; resume: boolean; done: boolean; hooks: Options['hooks'] };

export type ScreenPorts = {
  file: string;
  // The pages' panes changed: every screen redraws them, this one now drawn as a Claude screen.
  changed(): void;
  // A message into the session under the key, which starts it: the worker's first prompt.
  tell(key: number, text: string): void;
  stop(key: number): void;
  notify(id: string, state: WorkerState, waiting?: StopWaiting): void;
};

// What a screen event says about its worker: a question waiting on you, the question gone, or the
// session's conversation written, which is what a later start resumes rather than starts fresh.
export function screenSignal(event: ChatEvent): WorkerState | 'started' | null {
  if (event.kind === 'ask') return 'blocked';
  if (event.kind === 'ask-gone') return 'running';
  if (event.kind === 'message' && event.message.type === 'system' && event.message.subtype === 'init') return 'started';
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
    )) : [];
  } catch {
    return [];
  }
}

export function screenWorkers(ports: ScreenPorts) {
  const live = new Map<string, Worker>();
  // Saved by a run before this launch, until its project opens.
  let waiting = savedScreens(ports.file);

  function save(): void {
    const kept = [...live.values()].map(({ projectPath, index, directory, session, name, dispatcherPath, cardId }) => (
      { projectPath, index, directory, session, name, dispatcherPath, cardId }
    ));
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

  function add(id: string, saved: Saved, resume: boolean): void {
    live.set(id, { ...saved, id, resume, done: false, hooks: hooks(id) });
  }

  const byKey = (key: number): Worker | undefined => [...live.values()].find((worker) => screenKey(worker.id) === key);

  return {
    start(id: string, projectPath: string, directory: string, screen: ScreenStart, cardId: string | null, dispatcherPath: string): void {
      const { index } = paneFromId(id);
      add(id, { projectPath, index, directory, session: screen.session, name: screen.name, dispatcherPath, cardId }, false);
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
    working: (id: string): boolean | undefined => (live.has(id) ? !live.get(id)?.done : undefined),
    ids: (): string[] => [...live.keys()],
    directoryOf: (key: number): string | undefined => byKey(key)?.directory,
    session(key: number): ScreenSession | undefined {
      const worker = byKey(key);
      return worker && { session: worker.session, resume: worker.resume, name: worker.name, hooks: worker.hooks };
    },
    observe(key: number, event: ChatEvent): void {
      const worker = byKey(key);
      const signal = worker && screenSignal(event);
      if (!worker || !signal) return;
      if (signal === 'started') worker.resume = true;
      else report(worker.id, signal);
    },
    // The pane closed or released: the session goes with it.
    drop(id: string): void {
      if (!live.delete(id)) return;
      ports.stop(screenKey(id));
      save();
    },
    // The project opened in `slot`: the workers saved for it, back under this slot's pane ids, each to
    // be opened as main's worker again. Their sessions start when shown or told something.
    comeBack(slot: number, projectPath: string): Saved[] {
      const back = waiting.filter((saved) => saved.projectPath === projectPath);
      waiting = waiting.filter((saved) => saved.projectPath !== projectPath);
      for (const saved of back) add(terminalId(slot, saved.index), saved, true);
      if (back.length > 0) save();
      return back;
    },
  };
}
