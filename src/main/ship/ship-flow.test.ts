import { execFileSync } from 'node:child_process';
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { addCard, emptyBoard } from '../../shared/board/board';
import type { ShipResult, WorktreeEntry } from '../../shared/app/bridge';
import { BOARD_FOLDER_PATH, writeBoard } from '../board/board-store';
import { shipFlow, type ShipPorts } from './ship-flow';
import { BUMP_VERSION } from '../skills/work-card-skill';
import { temporaryFolder } from '../testing/temporary-folder';

// The ship move is a committed write, so its read must not salvage: a rename would leave the second
// run a clean board, and `git add -A` would commit the card as deleted.

describe('a resumed ship over a card file that does not parse', () => {
  it('refuses on every run and leaves the file under its own name', async () => {
    const worktreePath = temporaryFolder('ship-flow-');
    writeBoard(worktreePath, addCard(emptyBoard(), { column: 1, card: 0 }, 'card', 'the card').board);
    const cards = join(worktreePath, BOARD_FOLDER_PATH, 'cards');
    writeFileSync(join(cards, 'broken.json'), '{ "id": "broken", }');
    const entry: WorktreeEntry = {
      cardId: 'card', title: 'the card', projectPath: worktreePath, branch: 'work', worktreePath, pane: null,
      startedAt: new Date().toISOString(), reviewing: false,
    };
    const shipCard = shipFlow({
      worktrees: () => [entry],
      recordWorktree: (recorded) => recorded,
      makeWorktree: () => { throw new Error('a resumed ship makes no worktree'); },
      attachPane: () => { throw new Error('a refused ship attaches no pane'); },
      agentRunsIn: () => false,
      dropDeadWorktrees: () => undefined,
      forgetReview: () => undefined,
      bumpsVersion: () => false,
      queue: (_, run) => run(),
    });
    for (let run = 0; run < 2; run += 1) {
      const result = await shipCard({ projectPath: worktreePath, cardId: 'card', title: 'the card', slot: 0 });
      expect(result).toEqual({ ok: false, message: expect.stringContaining(join(cards, 'broken.json')) });
    }
    expect(readdirSync(cards).filter((name) => name.startsWith('broken'))).toEqual(['broken.json']);
  });
});

// The prompt is the only thing carrying projects.yaml's bumpVersion to the agent, and the setting is
// read by the project's path: a worktree folder is never listed there, so asking about it would
// quietly turn every bump off.
describe('the prompt a ship starts its agent on', () => {
  function project(): string {
    const origin = temporaryFolder('ship-origin-');
    const projectPath = temporaryFolder('ship-project-');
    const run = (cwd: string, ...gitArguments: string[]) => execFileSync('git', gitArguments, { cwd, stdio: 'ignore' });
    run(origin, 'init', '-q', '--bare', '-b', 'trunk');
    run(projectPath, 'init', '-q', '-b', 'trunk');
    run(projectPath, 'config', 'user.email', 'test@example.com');
    run(projectPath, 'config', 'user.name', 'Test');
    writeBoard(projectPath, addCard(emptyBoard(), { column: 1, card: 0 }, 'card', 'the card').board);
    run(projectPath, 'add', '-A');
    run(projectPath, 'commit', '-qm', 'first');
    run(projectPath, 'remote', 'add', 'origin', origin);
    run(projectPath, 'push', '-q', 'origin', 'trunk');
    run(projectPath, 'remote', 'set-head', 'origin', 'trunk');
    return projectPath;
  }

  function ports(projectPath: string, worktrees: WorktreeEntry[]) {
    const asked: string[] = [];
    const prompts: string[] = [];
    const flowPorts: ShipPorts = {
      worktrees: () => worktrees,
      recordWorktree: (recorded) => recorded,
      makeWorktree: () => Promise.resolve({ branch: 'trunk', worktreePath: projectPath }),
      attachPane: (entry, _, prompt): Promise<ShipResult> => { prompts.push(prompt); return Promise.resolve({ ok: true, entry }); },
      agentRunsIn: () => false,
      dropDeadWorktrees: () => undefined,
      forgetReview: () => undefined,
      bumpsVersion: (path) => { asked.push(path); return true; },
      queue: (_, run) => run(),
    };
    return { shipCard: shipFlow(flowPorts), asked, prompts };
  }

  const request = (projectPath: string) => ({ projectPath, cardId: 'card', title: 'the card', slot: 0 });

  it('asks about the project, not the worktree, and names its base, on a first ship', async () => {
    const projectPath = project();
    const { shipCard, asked, prompts } = ports(projectPath, []);
    await shipCard(request(projectPath));
    expect(asked).toEqual([projectPath]);
    expect(prompts).toEqual([`/work-card card ${BUMP_VERSION} trunk`]);
  });

  it('does the same when it finishes a ship that stopped part way', async () => {
    const projectPath = project();
    const worktreePath = temporaryFolder('ship-worktree-');
    writeBoard(worktreePath, addCard(emptyBoard(), { column: 1, card: 0 }, 'card', 'the card').board);
    execFileSync('git', ['init', '-q'], { cwd: worktreePath, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: worktreePath });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: worktreePath });
    const existing: WorktreeEntry = {
      cardId: 'card', title: 'the card', projectPath, branch: 'work', worktreePath, pane: null,
      startedAt: new Date().toISOString(), reviewing: false,
    };
    const { shipCard, asked, prompts } = ports(projectPath, [existing]);
    await shipCard(request(projectPath));
    expect(asked).toEqual([projectPath]);
    expect(prompts).toEqual([`/work-card card ${BUMP_VERSION} trunk`]);
  });
});
