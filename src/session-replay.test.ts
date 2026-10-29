import { describe, expect, it } from 'vitest';
import { paneScreenCopy } from './pane-screen-copy';
import { replaySession } from './session-replay';

describe('replaySession', () => {
  it('replays the output of every pane that has any, then the panes whose shell has ended', () => {
    const live = paneScreenCopy(() => ({ cols: 80, rows: 24 }));
    live.push('prompt');
    const ended = paneScreenCopy(() => ({ cols: 80, rows: 24 }));
    ended.push('bye');
    ended.exit(1);
    const quiet = paneScreenCopy(() => ({ cols: 80, rows: 24 }));
    const sent: unknown[][] = [];
    replaySession({
      screenCopies: new Map([['0:0', live], ['0:1', ended], ['0:2', quiet]]),
      projects: () => ({ projects: [], panes: [] }),
      worktrees: () => ({ entries: [], paneDirectories: {} }),
      usage: () => 'usage' as never,
    }, (channel, args) => sent.push([channel, ...args]));
    expect(sent).toEqual([
      ['projects:change', { projects: [], panes: [] }],
      ['pty:data', '0:0', '\x1bcprompt'],
      ['pty:data', '0:1', '\x1bcbye'],
      ['pty:exit', '0:1', 1],
      ['worktree:change', { entries: [], paneDirectories: {} }],
      ['usage:change', 'usage'],
    ]);
  });
});
