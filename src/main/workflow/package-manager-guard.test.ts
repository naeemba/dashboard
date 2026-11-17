import { describe, expect, it } from 'vitest';
import { managersUsed, nearestLockfile, packageManagerGuard } from './package-manager-guard';

const files = (...paths: string[]) => (path: string) => paths.includes(path);

describe('nearestLockfile', () => {
  it('finds the root lockfile from a package inside the repository', () => {
    expect(nearestLockfile('/work/app/packages/core', files('/work/app/.git', '/work/app/pnpm-lock.yaml'))).toEqual({ lockfile: 'pnpm-lock.yaml', manager: 'pnpm' });
  });

  it('stops at the repository top, so a lockfile above it is not read', () => {
    expect(nearestLockfile('/work/app/src', files('/work/app/.git', '/work/package-lock.json'))).toBeNull();
  });

  it('reads none where one folder holds lockfiles of two managers', () => {
    expect(nearestLockfile('/work/app', files('/work/app/yarn.lock', '/work/app/package-lock.json'))).toBeNull();
    expect(nearestLockfile('/work/app', files('/work/app/bun.lock', '/work/app/bun.lockb'))).toEqual({ lockfile: 'bun.lock', manager: 'bun' });
  });
});

describe('managersUsed', () => {
  it.each([
    ['npm install', 'npm'],
    ['npm i -D vitest', 'npm'],
    ['npm ci', 'npm'],
    ['npm --silent run lint', 'npm'],
    ['npm test', 'npm'],
    ['yarn', 'yarn'],
    ['yarn add react', 'yarn'],
    ['bun install', 'bun'],
    ['git pull && npm install && pnpm test', 'npm'],
    ['pnpm install', 'pnpm'],
    ['sudo /usr/bin/npm install -g x', 'npm'],
  ])('reads %s as installing or running through %s', (command, used) => {
    expect(managersUsed(command)).toContain(used);
  });

  it.each([
    'npm version minor --no-git-tag-version',
    'npm view vitest version',
    'npx tsc --noEmit',
    'git commit -m "npm install broke"',
    'grep -rn "npm install" docs',
  ])('reads %s as neither', (command) => {
    expect(managersUsed(command)).toEqual([]);
  });
});

describe('packageManagerGuard', () => {
  const pnpmProject = files('/work/app/.git', '/work/app/pnpm-lock.yaml');

  it('denies naming the lockfile and the manager to use', () => {
    const reason = packageManagerGuard('Bash', { command: 'npm install' }, '/work/app', pnpmProject)?.hookSpecificOutput.permissionDecisionReason;
    expect(reason).toContain('pnpm-lock.yaml');
    expect(reason).toContain('with pnpm');
  });

  it("refuses pnpm in an npm project, and lets the project's own manager through", () => {
    const npmProject = files('/work/app/package-lock.json');
    expect(packageManagerGuard('Bash', { command: 'pnpm install' }, '/work/app', npmProject)).toBeDefined();
    expect(packageManagerGuard('Bash', { command: 'npm install' }, '/work/app', npmProject)).toBeUndefined();
    expect(packageManagerGuard('Bash', { command: 'pnpm install && pnpm run lint' }, '/work/app', pnpmProject)).toBeUndefined();
  });

  it('checks no file for a command naming no manager', () => {
    let checked = 0;
    packageManagerGuard('Bash', { command: 'git status' }, '/work/app', () => (checked += 1) < 0);
    expect(checked).toBe(0);
  });

  it('says nothing for another tool, no folder, or a project with no lockfile', () => {
    expect(packageManagerGuard('Edit', { command: 'npm install' }, '/work/app', pnpmProject)).toBeUndefined();
    expect(packageManagerGuard('Bash', { command: 'npm install' }, undefined, pnpmProject)).toBeUndefined();
    expect(packageManagerGuard('Bash', { command: 'npm install' }, '/work/other', files('/work/other/.git'))).toBeUndefined();
  });
});
