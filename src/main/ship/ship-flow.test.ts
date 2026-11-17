import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { addCard, emptyBoard } from '../../shared/board/board';
import type { ShipResult, WorktreeEntry } from '../../shared/app/bridge';
import { writeBoard } from '../board/board-store';
import { shipFlow, type ShipPorts } from './ship-flow';
import { BUMP_VERSION } from '../skills/work-card-skill';
import { temporaryFolder } from '../testing/temporary-folder';

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

// The prompt is the only thing carrying projects.yaml's bumpVersion to the agent, and the setting is
// read by the project's path: a worktree folder is never listed there, so asking about it would
// quietly turn every bump off.
describe('the prompt a ship starts its agent on', () => {
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

// The card's column is origin's main's. A card file committed on the branch rides the merge into main
// and puts a card the app had moved on back in Ship, which starts another agent (ship-decision-3).
describe("a ship's branch", () => {
  const git = (cwd: string, ...gitArguments: string[]) => execFileSync('git', gitArguments, { cwd, encoding: 'utf8' });

  it('is left at origin\'s tip, its board untouched, on a first ship', async () => {
    const projectPath = project();
    await ports(projectPath, []).shipCard(request(projectPath));
    expect(git(projectPath, 'rev-list', 'origin/trunk..HEAD')).toBe('');
    expect(git(projectPath, 'status', '--porcelain')).toBe('');
  });

  it('gets no board commit when a ship that stopped part way is finished', async () => {
    const projectPath = project();
    const existing: WorktreeEntry = {
      cardId: 'card', title: 'the card', projectPath, branch: 'trunk', worktreePath: projectPath, pane: null,
      startedAt: new Date().toISOString(), reviewing: false,
    };
    await ports(projectPath, [existing]).shipCard(request(projectPath));
    expect(git(projectPath, 'rev-list', 'origin/trunk..HEAD')).toBe('');
    expect(git(projectPath, 'status', '--porcelain')).toBe('');
  });
});
