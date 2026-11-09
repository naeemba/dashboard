import { describe, expect, it } from 'vitest';
import type { LogDraft } from '../../../shared/app/log-entry';
import { bind } from '../action';
import { paneRestart } from './restart';

// `before` is the pane's scope before the spawn, `after` the one the spawn hands it.
function restarting({ running = false, before, after, stopScope = async () => undefined }: {
  running?: boolean; before?: string; after?: string; stopScope?: (unit: string) => Promise<void>;
}) {
  const units = new Map<string, string>();
  if (before !== undefined) units.set('2:3', before);
  const done: string[] = [];
  const logged: LogDraft[] = [];
  const restart = bind(paneRestart, {
    running: () => running,
    scopeOf: (id) => units.get(id),
    spawn: (id) => {
      done.push(`spawn ${id}`);
      if (after === undefined) units.delete(id);
      else units.set(id, after);
    },
    stopScope: async (unit) => { done.push(`stop ${unit}`); await stopScope(unit); },
    log: (draft) => { logged.push(draft); },
  });
  return { restart, done, logged };
}

describe('pane.restart', () => {
  it('starts the shell again and then stops the scope the old one ran in', async () => {
    const { restart, done } = restarting({ before: 'pane-api-3-old.scope', after: 'pane-api-3-new.scope' });
    expect(await restart.call({ id: '2:3' })).toEqual({ output: 'restarted 2:3' });
    expect(done).toEqual(['spawn 2:3', 'stop pane-api-3-old.scope']);
  });

  it('stops the old scope when the new shell starts unscoped, and nothing when there was none', async () => {
    const unscoped = restarting({ before: 'pane-api-3-old.scope' });
    await unscoped.restart.call({ id: '2:3' });
    expect(unscoped.done).toEqual(['spawn 2:3', 'stop pane-api-3-old.scope']);
    const none = restarting({ after: 'pane-api-3-new.scope' });
    await none.restart.call({ id: '2:3' });
    expect(none.done).toEqual(['spawn 2:3']);
  });

  it('refuses a pane whose shell runs, and starts nothing over it', async () => {
    const { restart, done } = restarting({ running: true, before: 'pane-api-3-old.scope' });
    expect(await restart.call({ id: '2:3' })).toEqual({ refused: '2:3 has a shell running' });
    expect(done).toEqual([]);
  });

  it('says and logs an old scope it could not stop', async () => {
    const { restart, logged } = restarting({
      before: 'pane-api-3-old.scope', after: 'pane-api-3-new.scope', stopScope: async () => { throw new Error('timed out'); },
    });
    expect(await restart.call({ id: '2:3' })).toEqual({ output: 'restarted 2:3; pane-api-3-old.scope was not stopped: timed out' });
    expect(logged).toMatchObject([{ level: 'warn', action: 'pane.restart', context: { slot: 2, pane: 3 } }]);
  });
});
