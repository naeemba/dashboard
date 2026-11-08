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
    command: () => ({ args: [], directory: '/work/api' }), setPaneCommand: () => undefined,
    shells: new Map(), spawn: () => undefined, agentStarted: () => undefined,
    startScreen, log: () => undefined,
  });
  return { dispatch, mainsWorkers };
}

describe('paneActions', () => {
  it('claims the pane for the main its worker reports to, and lets go of it for an agent of nobody\'s', () => {
    const { dispatch, mainsWorkers } = wired();
    dispatch(RUN);
    expect(mainsWorkers.get('2:3')).toBe('/work/desk');
    dispatch({ ...RUN, dispatcherPath: null });
    expect(mainsWorkers.has('2:3')).toBe(false);
  });

  it('throws to the caller when a start fails, so its own catch reports it', () => {
    const { dispatch } = wired(() => { throw new Error('no screen'); });
    expect(() => dispatch(RUN)).toThrow('no screen');
  });
});
