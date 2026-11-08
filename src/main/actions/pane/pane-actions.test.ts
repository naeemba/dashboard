import { describe, expect, it } from 'vitest';
import { paneActions } from './pane-actions';
import type { PaneDispatchInput } from './dispatch';

const RUN: PaneDispatchInput = {
  id: '2:3', projectPath: '/work/api', directory: '/work/api', prompt: 'research the cache',
  resume: null, cardId: null, dispatcherPath: '/work/desk', as: null,
};

function wired(startScreen: () => void = () => undefined) {
  const mainsWorkers = new Map<string, string>();
  const { dispatch } = paneActions({
    platform: 'linux', shellCommand: () => '/bin/zsh', newSession: () => 'new-session',
    forgetAnswers: () => undefined, mainsWorkers,
    commands: new Map([['2:3', { args: [], directory: '/work/api' }]]), setPaneCommand: () => undefined,
    shells: new Map(), spawn: () => undefined, agentStarted: () => undefined,
    startScreen, log: () => undefined,
    project: () => undefined, openPanes: () => [], drop: () => undefined,
    endClaim: () => undefined, changed: () => undefined, screenPrompt: () => false, typeIntoShell: () => undefined,
    kept: () => [], listenTo: () => undefined, takeResume: () => null, owedResumes: () => [], moveResume: () => undefined,
    screensBack: () => [], worktrees: () => [], panesBeforeLaunch: new Map(), realPath: (folder) => folder,
    givePane: () => undefined,
  });
  return { dispatch, mainsWorkers };
}

describe('paneActions', () => {
  it('claims the pane for the main its worker reports to, and lets go of it for an agent of nobody\'s', async () => {
    const { dispatch, mainsWorkers } = wired();
    await dispatch.call(RUN);
    expect(mainsWorkers.get('2:3')).toBe('/work/desk');
    await dispatch.call({ ...RUN, dispatcherPath: null });
    expect(mainsWorkers.has('2:3')).toBe(false);
  });

  it('rejects to the caller when a start fails, so its own catch reports it', async () => {
    const { dispatch } = wired(() => { throw new Error('no screen'); });
    await expect(dispatch.call(RUN)).rejects.toThrow('no screen');
  });
});
