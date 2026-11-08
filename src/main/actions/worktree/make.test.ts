import { describe, expect, it } from 'vitest';
import { bind } from '../action';
import { worktreeMake } from './make';

function maker() {
  const ran: string[] = [];
  const queued: string[] = [];
  const make = bind(worktreeMake, {
    async git(gitArguments) {
      ran.push(gitArguments.join(' '));
      return gitArguments[0] === 'for-each-ref' ? 'main\n' : '';
    },
    baseBranch: async () => 'main',
    newId: () => 'fresh-id',
    queue: (projectPath, run) => { queued.push(projectPath); return run(); },
  });
  return { make, ran, queued };
}

describe('worktree.make', () => {
  it('makes a card branch off the base the ship fetched, inside the queue the ship holds', async () => {
    const { make, ran, queued } = maker();
    const made = await make.call({ kind: 'card', projectPath: '/code/api', title: 'Fix login', cardId: 'card-1', base: 'main' });
    expect(made).toMatchObject({ branch: expect.stringContaining('fix-login') });
    expect(queued).toEqual([]);
    expect(ran.filter((line) => line.startsWith('fetch'))).toEqual([]);
    expect(ran.at(-1)).toMatch(/^worktree add -b \S*fix-login\S* \S+ origin\/main$/);
  });

  it('takes the queue and fetches for a throwaway, which nothing else holds it for', async () => {
    const { make, ran, queued } = maker();
    await make.call({ kind: 'throwaway', projectPath: '/code/api', title: 'try a thing' });
    expect(queued).toEqual(['/code/api']);
    expect(ran[0]).toBe('fetch origin main');
  });

  it('checks a reviewed card branch out again at its own path, with no new branch', async () => {
    const { make, ran, queued } = maker();
    await make.call({ kind: 'again', projectPath: '/code/api', worktreePath: '/code/api.worktrees/fix', branch: 'fix' });
    expect(ran).toEqual(['worktree add /code/api.worktrees/fix fix']);
    expect(queued).toEqual([]);
  });

  it('refuses a make it cannot read', async () => {
    const { make, ran } = maker();
    expect(await make.call({ kind: 'card', projectPath: '/code/api', title: 'no id' })).toHaveProperty('refused');
    expect(ran).toEqual([]);
  });
});
