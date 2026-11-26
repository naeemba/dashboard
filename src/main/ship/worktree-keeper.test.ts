import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readWorktrees } from './worktree-store';
import { worktreeKeeper } from './worktree-keeper';
import type { WorktreeEntry, WorktreeList } from '../../shared/app/bridge';
import type { PaneCommand } from '../../shared/panes/pane-reading';
import { temporaryFolder } from '../testing/temporary-folder';
import { git, useGitTestEnvironment } from '../board/create-task-git-fixture';

const folder = temporaryFolder('dashboard-keeper-');
const projectPath = join(folder, 'project');

function entry(worktreePath: string, cardId: string): WorktreeEntry {
  return {
    cardId, title: cardId, projectPath, branch: cardId, worktreePath,
    pane: 2, startedAt: '2026-11-01T09:00:00.000Z', reviewing: false,
  };
}

function keeperWith(entries: WorktreeEntry[], commands: Map<string, PaneCommand>) {
  const file = join(temporaryFolder('dashboard-keeper-record-'), 'worktrees.json');
  const sent: WorktreeList[] = [];
  const keeper = worktreeKeeper({ file, entries, commands, shells: new Map(), closeScreensIn: () => undefined, announce: (list) => sent.push(list) });
  return { keeper, file, sent };
}

describe('dropDead', () => {
  it('drops a record whose folder is gone, hands its panes back to the project, writes and tells', () => {
    const living = entry(folder, 'living');
    const gone = entry(join(folder, 'gone'), 'gone');
    const commands = new Map<string, PaneCommand>([
      ['0-2', { args: ['claude'], directory: gone.worktreePath }],
      ['0-3', { args: [], directory: living.worktreePath }],
    ]);
    const { keeper, file, sent } = keeperWith([living, gone], commands);
    keeper.dropDead();
    expect(keeper.entries()).toEqual([living]);
    expect(commands.get('0-2')).toEqual({ args: [], directory: projectPath });
    expect(commands.get('0-3')).toEqual({ args: [], directory: living.worktreePath });
    expect(readWorktrees(file)).toEqual([living]);
    expect(sent).toHaveLength(1);
    expect(sent[0].entries).toEqual([living]);
  });

  it('writes and sends nothing when every folder is still there', () => {
    const { keeper, file, sent } = keeperWith([entry(folder, 'living')], new Map());
    keeper.dropDead();
    expect(existsSync(file)).toBe(false);
    expect(sent).toHaveLength(0);
  });
});

describe('remove', () => {
  it('keeps a record the sweep would drop while its removal is still running, and lets go after', async () => {
    const gone = entry(join(folder, 'gone-mid-removal'), 'gone');
    const { keeper } = keeperWith([gone], new Map());
    const pending = keeper.remove(gone.worktreePath, false);
    keeper.dropDead();
    expect(keeper.entries()).toEqual([gone]);
    // git fails here, since the project folder does not exist; the hold still has to be let go.
    await pending;
    keeper.dropDead();
    expect(keeper.entries()).toEqual([]);
  });

  describe('with a check of what is past the board', () => {
    useGitTestEnvironment();

    const CARD = '.dashboard/board/cards/a1.json';

    // A worktree whose one change is a card's file: what the board's force lets go.
    function boardOnlyWorktree() {
      const project = join(temporaryFolder('dashboard-keeper-git-'), 'project');
      mkdirSync(project);
      git(project, 'init', '--quiet', '--initial-branch', 'main');
      mkdirSync(join(project, '.dashboard', 'board', 'cards'), { recursive: true });
      writeFileSync(join(project, CARD), '{"column":"Doing"}');
      git(project, 'add', '-A');
      git(project, 'commit', '--quiet', '-m', 'start');
      const worktreePath = join(project, '..', 'card');
      git(project, 'worktree', 'add', '--quiet', '-b', 'card', worktreePath);
      writeFileSync(join(worktreePath, CARD), '{"column":"Review"}');
      return { project, worktreePath };
    }

    it('keeps the folder in the reason the check gives', async () => {
      const { project, worktreePath } = boardOnlyWorktree();
      const { keeper } = keeperWith([], new Map());
      const reason = 'its board edits of .dashboard/board/cards/a1.json never reached origin/main';
      expect(await keeper.remove(worktreePath, false, project, async () => reason)).toEqual({ ok: false, message: reason, dirty: [] });
      expect(existsSync(worktreePath)).toBe(true);
    });

    it('removes it when the check has no reason', async () => {
      const { project, worktreePath } = boardOnlyWorktree();
      const { keeper } = keeperWith([], new Map());
      expect(await keeper.remove(worktreePath, false, project, async () => null)).toMatchObject({ ok: true });
      expect(existsSync(worktreePath)).toBe(false);
    });

    it('does not ask about a clean worktree, whose unforced remove loses no commit', async () => {
      const { project, worktreePath } = boardOnlyWorktree();
      git(worktreePath, 'commit', '--quiet', '-am', 'board: move a1');
      const { keeper } = keeperWith([], new Map());
      let asked = false;
      const check = async () => { asked = true; return 'never reached origin/main'; };
      expect(await keeper.remove(worktreePath, false, project, check)).toMatchObject({ ok: true });
      expect(existsSync(worktreePath)).toBe(false);
      expect(asked).toBe(false);
    });
  });

  it('answers yes for a path with no record and no project', async () => {
    const { keeper, sent } = keeperWith([], new Map());
    expect(await keeper.remove(join(folder, 'nowhere'), false)).toEqual({ ok: true, message: '', dirty: [] });
    expect(sent).toHaveLength(0);
  });
});

describe('givePane', () => {
  it('names the pane on the card taking it, and the card that still named it gives it up', () => {
    const before = entry(join(folder, 'before'), 'before');
    const taking = { ...entry(join(folder, 'taking'), 'taking'), pane: null };
    const { keeper } = keeperWith([before, taking], new Map());
    expect(keeper.givePane(taking, 2)).toEqual({ ...taking, pane: 2 });
    expect(keeper.entries().map((each) => [each.cardId, each.pane])).toEqual([['before', null], ['taking', 2]]);
  });
});
