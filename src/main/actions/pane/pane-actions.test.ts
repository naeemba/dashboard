import { describe, expect, it, vi } from 'vitest';
import type { LogDraft } from '../../../shared/app/log-entry';
import { paneActions } from './pane-actions';
import type { PaneDispatchInput } from './dispatch';

const RUN: PaneDispatchInput = {
  id: '2:3', projectPath: '/work/api', directory: '/work/api', prompt: 'research the cache',
  resume: null, cardId: null, dispatcherPath: '/work/desk', as: null,
};

// The pane's scope before the dispatch.
const replacing = () => new Map([['2:3', 'pane-api-3-old.scope']]);

// `units` is each pane's scope as main holds it; a spawn hands the pane the next one in `spawned`.
function wired({ startScreen = () => undefined, units = new Map<string, string>(), spawned = [], stopScope = async () => undefined }: {
  startScreen?: () => void; units?: Map<string, string>; spawned?: string[]; stopScope?: (unit: string) => Promise<void>;
} = {}) {
  const mainsWorkers = new Map<string, string>();
  const stops = vi.fn(stopScope);
  const logged: LogDraft[] = [];
  const { dispatch, send } = paneActions({
    platform: 'linux', shellCommand: () => '/bin/zsh', newSession: () => 'new-session', ranAs: () => undefined,
    forgetAnswers: () => undefined, mainsWorkers,
    commands: new Map([['2:3', { args: [], directory: '/work/api' }]]), setPaneCommand: () => undefined,
    shells: new Map([['2:3', { kill: () => undefined }]]), spawn: (id) => { const unit = spawned.shift(); if (unit === undefined) units.delete(id); else units.set(id, unit); }, agentStarted: () => undefined,
    startScreen, log: (draft) => logged.push(draft),
    project: () => undefined, openPanes: () => [], drop: () => undefined, scopeOf: (id) => units.get(id), stopScope: stops,
    endClaim: () => undefined, changed: () => undefined, agentIn: () => true, screenIn: () => true, screenPrompt: () => false, typeIntoShell: () => undefined,
    kept: () => [], listenTo: () => undefined, takeResume: () => null, owedResumes: () => [], moveResume: () => undefined,
    screensBack: () => [], worktrees: () => [], panesBeforeLaunch: new Map(), realPath: (folder) => folder,
    givePane: () => undefined,
  });
  return { dispatch, send, mainsWorkers, stops, logged };
}

describe('paneActions', () => {
  it('claims the pane for the main its worker reports to, and lets go of it for an agent of nobody\'s', async () => {
    const { dispatch, mainsWorkers } = wired();
    await dispatch.call(RUN);
    expect(mainsWorkers.get('2:3')).toBe('/work/desk');
    await dispatch.call({ ...RUN, dispatcherPath: null });
    expect(mainsWorkers.has('2:3')).toBe(false);
  });

  it('claims the pane for the main that sends its agent work', async () => {
    const { send, mainsWorkers } = wired();
    await send.call({ id: '2:3', text: 'fix it', dispatcherPath: '/work/desk' });
    expect(mainsWorkers.get('2:3')).toBe('/work/desk');
  });

  it('rejects to the caller when a start fails, so its own catch reports it', async () => {
    const { dispatch } = wired({ startScreen: () => { throw new Error('no screen'); } });
    await expect(dispatch.call(RUN)).rejects.toThrow('no screen');
  });

  it('stops the scope of the shell a terminal agent replaces, once the new one has its own', async () => {
    const { dispatch, stops } = wired({ units: replacing(), spawned: ['agent-api-3-new.scope'] });
    await dispatch.call({ ...RUN, as: 'terminal' });
    expect(stops.mock.calls).toEqual([['pane-api-3-old.scope']]);
  });

  it('stops the replaced scope when the new shell starts unscoped, and nothing when there was none', async () => {
    const replaced = wired({ units: replacing() });
    await replaced.dispatch.call({ ...RUN, as: 'terminal' });
    expect(replaced.stops).toHaveBeenCalledWith('pane-api-3-old.scope');
    const none = wired({ spawned: ['agent-api-3-new.scope'] });
    await none.dispatch.call({ ...RUN, as: 'terminal' });
    expect(none.stops).not.toHaveBeenCalled();
  });

  it('leaves a scope alone when the shell is not replaced, and logs a stop that fails', async () => {
    // A screen into a pane whose shell already stands in the folder keeps the shell and its scope.
    const kept = wired({ units: replacing() });
    await kept.dispatch.call({ ...RUN, as: 'screen' });
    expect(kept.stops).not.toHaveBeenCalled();
    const failing = wired({ units: replacing(), spawned: ['agent-api-3-new.scope'], stopScope: async () => { throw new Error('timed out'); } });
    await failing.dispatch.call({ ...RUN, as: 'terminal' });
    await vi.waitFor(() => expect(failing.logged.at(-1)?.message).toBe('pane-api-3-old.scope was not stopped: timed out'));
  });
});
