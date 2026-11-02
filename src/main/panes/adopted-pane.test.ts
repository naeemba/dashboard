import { describe, expect, it } from 'vitest';
import { adoptedPane } from './adopted-pane';
import { paneKey, type Survivor } from './pane-host-protocol';
import { EDITOR_INDEX } from '../../shared/panes/terminals';
import type { WorktreeEntry } from '../../shared/app/bridge';

const SESSION = '0f8fad5b-d9cb-469f-a165-70867728950e';

function survivor(index: number, cwd: string, args: string[] = []): Survivor {
  return { key: paneKey('/project', index), pid: 1, file: '/bin/zsh', args, cwd, cols: 80, rows: 24, foreground: 'zsh', screen: '' };
}

const card = {
  cardId: 'card', title: 'Fix login', projectPath: '/project', branch: 'fix-login',
  worktreePath: '/project.worktrees/fix-login', pane: null, startedAt: '2026-11-02',
} as WorktreeEntry;

const same = (folder: string): string => folder;

describe('adoptedPane', () => {
  it('keeps a plain shell as it was spawned', () => {
    expect(adoptedPane(survivor(2, '/project'), null, [], new Map(), same))
      .toEqual({ command: { args: [], directory: '/project' }, card: undefined, worker: false });
  });

  it('names the pane on the card whose agent is still running in it', () => {
    const pane = adoptedPane(survivor(2, card.worktreePath, ['-c', 'claude']), null, [card], new Map([['card', 2]]), same);
    expect(pane).toMatchObject({ card });
  });

  it('leaves the card alone when its agent ran in another pane before the restart', () => {
    const pane = adoptedPane(survivor(3, card.worktreePath), null, [card], new Map([['card', 2]]), same);
    expect(pane).toMatchObject({ card: undefined });
  });

  it("gives a worker main dispatched back to main", () => {
    const saved = { session: SESSION, directory: '/project', dispatched: true };
    expect(adoptedPane(survivor(1, '/project'), saved, [], new Map(), same)).toMatchObject({ worker: true });
  });

  it('does not keep the editor, whose socket is named after a page the project may no longer be on', () => {
    expect(adoptedPane(survivor(EDITOR_INDEX, '/project'), null, [], new Map(), same)).toBeUndefined();
  });
});
