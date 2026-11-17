import os from 'node:os';
import { describe, expect, it } from 'vitest';
import { editsOtherWorktree, removesOwnWorktree, worktreeGuard } from './worktree-guard';

const own = '/p.worktrees/card';
const worktrees = ['/p', own, '/p.worktrees/other', '/p/.claude/worktrees/nested'];

describe('removesOwnWorktree', () => {
  it.each([
    'git worktree remove .',
    'git worktree remove --force /p.worktrees/card',
    'git worktree remove "$PWD"',
    'cd .. && git worktree remove card',
    'git -C /p worktree remove ../p.worktrees/card',
    'git status && git worktree remove -f ./',
    'sudo git worktree remove .',
    'git -c core.x=y worktree remove .',
  ])('refuses %s', (command) => {
    expect(removesOwnWorktree(command, own)).toBe(true);
  });

  it('refuses removing the worktree a session in one of its folders runs in', () => {
    expect(removesOwnWorktree('git worktree remove /p.worktrees/card', `${own}/src`)).toBe(true);
  });

  it.each([
    'git worktree remove ../other',
    'git worktree list',
    'git commit -m "never git worktree remove"; ls',
    'git commit -m "fix; git worktree remove ."',
    'cd /p && git worktree remove ../p.worktrees/other',
  ])('lets %s through', (command) => {
    expect(removesOwnWorktree(command, own)).toBe(false);
  });

  it('reads ~ as home, and a bare cd as a cd home', () => {
    expect(removesOwnWorktree('git worktree remove ~/w', `${os.homedir()}/w`)).toBe(true);
    expect(removesOwnWorktree('cd && git worktree remove w', `${os.homedir()}/w`)).toBe(true);
  });

  it('lets a nested worktree go once the command has left it, unless the session started there', () => {
    const command = 'cd /p && git worktree remove /p/.adopt-docs';
    expect(removesOwnWorktree(command, '/p/.adopt-docs', '/p')).toBe(false);
    expect(removesOwnWorktree(command, '/p/.adopt-docs', '/p/.adopt-docs')).toBe(true);
  });

  it('refuses a removal whose cd sits in a subshell, which leaves the shell in the worktree', () => {
    expect(removesOwnWorktree('(cd /p && git worktree remove /p/.adopt-docs)', '/p/.adopt-docs', '/p')).toBe(true);
    expect(removesOwnWorktree('(cd /p && cd /p && git worktree remove /p/.adopt-docs)', '/p/.adopt-docs', '/p')).toBe(true);
    expect(removesOwnWorktree('(cd ..; cd ..; git worktree remove /p/.adopt-docs)', '/p/.adopt-docs/src', '/p')).toBe(true);
  });

  it('runs a removal after a closed subshell in the shell\'s folder', () => {
    expect(removesOwnWorktree('(cd /x) && git worktree remove .', own)).toBe(true);
    expect(removesOwnWorktree('(cd /p/.adopt-docs) && git worktree remove /p/.adopt-docs', '/p')).toBe(false);
  });
});

describe('editsOtherWorktree', () => {
  it('refuses a file in a sibling worktree or the main checkout', () => {
    expect(editsOtherWorktree('/p.worktrees/other/a.ts', own, worktrees)).toBe(true);
    expect(editsOtherWorktree('/p/src/a.ts', own, worktrees)).toBe(true);
  });

  it('takes a worktree nested in the checkout for its own', () => {
    expect(editsOtherWorktree('/p/.claude/worktrees/nested/a.ts', '/p', worktrees)).toBe(true);
    expect(editsOtherWorktree('/p/.claude/worktrees/nested/a.ts', '/p/.claude/worktrees/nested/src', worktrees)).toBe(false);
  });

  it('lets through its own files, relative ones too, and files outside the repository', () => {
    expect(editsOtherWorktree(`${own}/src/a.ts`, own, worktrees)).toBe(false);
    expect(editsOtherWorktree('src/a.ts', own, worktrees)).toBe(false);
    expect(editsOtherWorktree('/home/me/notes.md', own, worktrees)).toBe(false);
  });

  it('does not take a folder sharing a prefix for the worktree', () => {
    expect(editsOtherWorktree('/p.worktrees/cardigan/a.ts', own, ['/p', own])).toBe(false);
  });
});

describe('worktreeGuard', () => {
  const list = () => worktrees;

  it('refuses each with its own reason', () => {
    const removal = worktreeGuard('Bash', { command: 'git worktree remove .' }, own, list, undefined);
    expect(removal?.hookSpecificOutput.permissionDecisionReason).toContain('kills this shell');
    const write = worktreeGuard('Write', { file_path: '/p/a.ts' }, own, list, undefined);
    expect(write?.hookSpecificOutput.permissionDecisionReason).toContain('another worktree');
  });

  it('lists no worktrees for a shell command, nor outside a repository', () => {
    const fails = () => { throw new Error('listed'); };
    expect(worktreeGuard('Bash', { command: 'ls' }, own, fails, undefined)).toBeUndefined();
    expect(worktreeGuard('Edit', { file_path: '/p/a.ts' }, own, () => null, undefined)).toBeUndefined();
    expect(worktreeGuard('Edit', { file_path: '/p/a.ts' }, '', list, undefined)).toBeUndefined();
  });
});
