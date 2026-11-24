import os from 'node:os';
import { describe, expect, it } from 'vitest';
import { editsOtherWorktree, removesOwnWorktree, worktreeGuard } from './worktree-guard';

const own = '/project.worktrees/card';
const worktrees = ['/project', own, '/project.worktrees/other', '/project/.claude/worktrees/nested'];

describe('removesOwnWorktree', () => {
  it.each([
    'git worktree remove .',
    'git worktree remove --force /project.worktrees/card',
    'git worktree remove "$PWD"',
    'cd .. && git worktree remove card',
    'git -C /project worktree remove ../project.worktrees/card',
    'git status && git worktree remove -f ./',
    'sudo git worktree remove .',
    'git -c core.x=y worktree remove .',
  ])('refuses %s', (command) => {
    expect(removesOwnWorktree(command, own)).toBe(true);
  });

  it('refuses removing the worktree a session in one of its folders runs in', () => {
    expect(removesOwnWorktree('git worktree remove /project.worktrees/card', `${own}/src`)).toBe(true);
  });

  it.each([
    'git worktree remove ../other',
    'git worktree list',
    'git commit -m "never git worktree remove"; ls',
    'git commit -m "fix; git worktree remove ."',
    'cd /project && git worktree remove ../project.worktrees/other',
  ])('lets %s through', (command) => {
    expect(removesOwnWorktree(command, own)).toBe(false);
  });

  it('reads ~ as home, and a bare cd as a cd home', () => {
    expect(removesOwnWorktree('git worktree remove ~/w', `${os.homedir()}/w`)).toBe(true);
    expect(removesOwnWorktree('cd && git worktree remove w', `${os.homedir()}/w`)).toBe(true);
  });

  it('lets a nested worktree go once the command has left it, unless the session started there', () => {
    const command = 'cd /project && git worktree remove /project/.adopt-docs';
    expect(removesOwnWorktree(command, '/project/.adopt-docs', '/project')).toBe(false);
    expect(removesOwnWorktree(command, '/project/.adopt-docs', '/project/.adopt-docs')).toBe(true);
  });

  it('refuses a removal whose cd sits in a subshell, which leaves the shell in the worktree', () => {
    expect(removesOwnWorktree('(cd /project && git worktree remove /project/.adopt-docs)', '/project/.adopt-docs', '/project')).toBe(true);
    expect(removesOwnWorktree('(cd /project && cd /project && git worktree remove /project/.adopt-docs)', '/project/.adopt-docs', '/project')).toBe(true);
    expect(removesOwnWorktree('(cd ..; cd ..; git worktree remove /project/.adopt-docs)', '/project/.adopt-docs/src', '/project')).toBe(true);
  });

  it('runs a removal after a closed subshell in the shell\'s folder', () => {
    expect(removesOwnWorktree('(cd /other) && git worktree remove .', own)).toBe(true);
    expect(removesOwnWorktree('(cd /project/.adopt-docs) && git worktree remove /project/.adopt-docs', '/project')).toBe(false);
  });

  it('skips a cd flag to read the folder it moves to', () => {
    expect(removesOwnWorktree('cd -P /project && git worktree remove .adopt-docs', '/project/.adopt-docs')).toBe(true);
  });
});

describe('editsOtherWorktree', () => {
  it('refuses a file in a sibling worktree or the main checkout', () => {
    expect(editsOtherWorktree('/project.worktrees/other/a.ts', own, worktrees)).toBe(true);
    expect(editsOtherWorktree('/project/src/a.ts', own, worktrees)).toBe(true);
  });

  it('takes a worktree nested in the checkout for its own', () => {
    expect(editsOtherWorktree('/project/.claude/worktrees/nested/a.ts', '/project', worktrees)).toBe(true);
    expect(editsOtherWorktree('/project/.claude/worktrees/nested/a.ts', '/project/.claude/worktrees/nested/src', worktrees)).toBe(false);
  });

  it('lets through its own files, relative ones too, and files outside the repository', () => {
    expect(editsOtherWorktree(`${own}/src/a.ts`, own, worktrees)).toBe(false);
    expect(editsOtherWorktree('src/a.ts', own, worktrees)).toBe(false);
    expect(editsOtherWorktree('/home/me/notes.md', own, worktrees)).toBe(false);
  });

  it('does not take a folder sharing a prefix for the worktree', () => {
    expect(editsOtherWorktree('/project.worktrees/cardigan/a.ts', own, ['/project', own])).toBe(false);
  });
});

describe('worktreeGuard', () => {
  const list = () => worktrees;

  it('refuses each with its own reason', () => {
    const removal = worktreeGuard('Bash', { command: 'git worktree remove .' }, own, list, undefined);
    expect(removal?.hookSpecificOutput.permissionDecisionReason).toContain('kills this shell');
    const write = worktreeGuard('Write', { file_path: '/project/a.ts' }, own, list, undefined);
    expect(write?.hookSpecificOutput.permissionDecisionReason).toContain('another worktree');
  });

  it('lists no worktrees for a shell command, nor outside a repository', () => {
    const fails = () => { throw new Error('listed'); };
    expect(worktreeGuard('Bash', { command: 'ls' }, own, fails, undefined)).toBeUndefined();
    expect(worktreeGuard('Edit', { file_path: '/project/a.ts' }, own, () => null, undefined)).toBeUndefined();
    expect(worktreeGuard('Edit', { file_path: '/project/a.ts' }, '', list, undefined)).toBeUndefined();
  });
});
