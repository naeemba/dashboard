import { describe, expect, it } from 'vitest';
import { paneRing } from './pane-ring';
import { replaySession } from './session-replay';

describe('replaySession', () => {
  it('replays the output of every pane that has any, then the panes whose shell has ended', () => {
    const live = paneRing(() => ({ cols: 80, rows: 24 }));
    live.push('prompt');
    const ended = paneRing(() => ({ cols: 80, rows: 24 }));
    ended.push('bye');
    ended.exit(1);
    const quiet = paneRing(() => ({ cols: 80, rows: 24 }));
    const sent: unknown[][] = [];
    replaySession({
      rings: new Map([['0:0', live], ['0:1', ended], ['0:2', quiet]]),
      projects: () => ({ projects: [] }),
      worktrees: () => ({ entries: [], paneDirectories: {} }),
      usage: () => 'usage' as never,
    }, (channel, args) => sent.push([channel, ...args]));
    expect(sent).toEqual([
      ['projects:change', { projects: [] }],
      ['pty:data', '0:0', '\x1bcprompt'],
      ['pty:data', '0:1', '\x1bcbye'],
      ['pty:exit', '0:1', 1],
      ['worktree:change', { entries: [], paneDirectories: {} }],
      ['usage:change', 'usage'],
    ]);
  });
});
