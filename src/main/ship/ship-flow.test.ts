import { describe, expect, it } from 'vitest';
import { addCard, emptyBoard } from '../../shared/board/board';
import type { ShipResult, WorktreeEntry } from '../../shared/app/bridge';
import { writeBoard } from '../board/board-store';
import { shipFlow, type ShipPorts } from './ship-flow';
import { BUMP_VERSION, REVIEW_LOOP } from '../skills/work-card-skill';
import { temporaryFolder } from '../testing/temporary-folder';
import { git, useGitTestEnvironment } from '../board/create-task-git-fixture';

useGitTestEnvironment();

function project(remote = 'origin'): string {
  const origin = temporaryFolder('ship-origin-');
  const projectPath = temporaryFolder('ship-project-');
  git(origin, 'init', '-q', '--bare', '-b', 'trunk');
  git(projectPath, 'init', '-q', '-b', 'trunk');
  writeBoard(projectPath, addCard(emptyBoard(), { column: 1, card: 0 }, 'card', 'the card').board);
  git(projectPath, 'add', '-A');
  git(projectPath, 'commit', '-qm', 'first');
  git(projectPath, 'remote', 'add', remote, origin);
  git(projectPath, 'push', '-q', remote, 'trunk');
  git(projectPath, 'remote', 'set-head', remote, 'trunk');
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
    autoLoop: () => true,
    queue: (_, run) => run(),
  };
  return { shipCard: shipFlow(flowPorts), asked, prompts };
}

const request = (projectPath: string) => ({ projectPath, cardId: 'card', title: 'the card', slot: 0 });

// The card's column is origin's main's. A card file committed on the branch rides the merge into main
// and puts a card the app had moved on back in Ship, which starts another agent (ship-decision-3).
function expectBranchUntouched(worktreePath: string): void {
  expect(git(worktreePath, 'rev-list', 'origin/trunk..HEAD')).toBe('');
  expect(git(worktreePath, 'status', '--porcelain')).toBe('');
}

// The prompt is the only thing carrying projects.yaml's bumpVersion to the agent, and the setting is
// read by the project's path: a worktree folder is never listed there, so asking about it would
// quietly turn every bump off.
describe('the prompt a ship starts its agent on', () => {
  it('asks about the project, not the worktree, names its base, and leaves the branch at origin\'s tip with a clean tree, on a first ship', async () => {
    const projectPath = project();
    const { shipCard, asked, prompts } = ports(projectPath, []);
    await shipCard(request(projectPath));
    expect(asked).toEqual([projectPath]);
    expect(prompts).toEqual([`/work-card card ${BUMP_VERSION} trunk origin ${REVIEW_LOOP}`]);
    expectBranchUntouched(projectPath);
  });

  it('does the same, branch left at origin\'s tip with a clean tree, when it finishes a ship that stopped part way', async () => {
    const projectPath = project();
    const worktreePath = temporaryFolder('ship-worktree-');
    git(worktreePath, 'clone', '-q', git(projectPath, 'remote', 'get-url', 'origin'), '.');
    const existing: WorktreeEntry = {
      cardId: 'card', title: 'the card', projectPath, branch: 'work', worktreePath, pane: null,
      startedAt: new Date().toISOString(), reviewing: false,
    };
    const { shipCard, asked, prompts } = ports(projectPath, [existing]);
    await shipCard(request(projectPath));
    expect(asked).toEqual([projectPath]);
    expect(prompts).toEqual([`/work-card card ${BUMP_VERSION} trunk origin ${REVIEW_LOOP}`]);
    expectBranchUntouched(worktreePath);
  });

  // A GitLab project kept on a remote called gitlab, and no origin: once refused as having no base.
  it('cuts from the project\'s only remote when it is not origin', async () => {
    const projectPath = project('gitlab');
    const { shipCard, prompts } = ports(projectPath, []);
    await shipCard(request(projectPath));
    expect(prompts).toEqual([`/work-card card ${BUMP_VERSION} trunk gitlab ${REVIEW_LOOP}`]);
  });
});
