import { describe, expect, it } from 'vitest';
import { installsRun, nearestLockfile, packageManagerGuard } from './package-manager-guard';

// The guard joins with the platform's separator, so on Windows it asks for `\work\app\.git`.
const files = (...paths: string[]) => (path: string) => paths.includes(path.replaceAll('\\', '/'));

describe('nearestLockfile', () => {
  it('finds the root lockfile from a package inside the repository', () => {
    expect(nearestLockfile('/work/app/packages/core', files('/work/app/.git', '/work/app/pnpm-lock.yaml'))).toEqual({ lockfile: 'pnpm-lock.yaml', manager: 'pnpm' });
  });

  it('stops at the repository top, so a lockfile above it is not read', () => {
    expect(nearestLockfile('/work/app/src', files('/work/app/.git', '/work/package-lock.json'))).toBeNull();
  });

  it('takes the nearest, so a monorepo package with its own lockfile is read before the root', () => {
    expect(nearestLockfile('/work/app/tools/cli/src', files('/work/app/.git', '/work/app/pnpm-lock.yaml', '/work/app/tools/cli/package-lock.json'))).toEqual({ lockfile: 'package-lock.json', manager: 'npm' });
  });

  it('reads none in a folder with no lockfile and no repository above it', () => {
    expect(nearestLockfile('/home/someone/scratch', files())).toBeNull();
  });

  it('reads none outside a repository, so a stray lockfile in a parent folder is not the project\'s', () => {
    expect(nearestLockfile('/home/someone/new-app', files('/home/someone/package-lock.json'))).toBeNull();
    expect(nearestLockfile('/home/someone/new-app', files('/home/someone/new-app/pnpm-lock.yaml'))).toBeNull();
  });

  it('reads none where one folder holds lockfiles of two managers', () => {
    expect(nearestLockfile('/work/app', files('/work/app/.git', '/work/app/yarn.lock', '/work/app/package-lock.json'))).toBeNull();
    expect(nearestLockfile('/work/app', files('/work/app/.git', '/work/app/bun.lock', '/work/app/bun.lockb'))).toEqual({ lockfile: 'bun.lock', manager: 'bun' });
  });
});

describe('installsRun', () => {
  it.each([
    ['npm install', 'npm'],
    ['npm i -D vitest', 'npm'],
    ['npm ci', 'npm'],
    ['npm cit', 'npm'],
    ['npm r lodash', 'npm'],
    ['npm --silent uninstall lodash', 'npm'],
    ['yarn', 'yarn'],
    ['yarn add react', 'yarn'],
    ['bun install', 'bun'],
    ['git pull && npm install && pnpm add x', 'npm'],
    ['pnpm install', 'pnpm'],
    ['sudo /usr/bin/npm install --save-dev x', 'npm'],
  ])('reads %s as installing through %s', (command, used) => {
    expect(installsRun(command, '/work/app').map((install) => install.manager)).toContain(used);
  });

  it.each([
    'npm version minor --no-git-tag-version',
    'npm test',
    'npm run lint',
    'yarn lint',
    'bun test',
    'bun run scripts/seed.ts',
    'npm view vitest version',
    'npx tsc --noEmit',
    'npm i -g x',
    'sudo npm install --global x',
    'npm install --location=global x',
    'pnpm add -g x',
    'yarn global add x',
    'bun add -g x',
    'pnpm dlx create-vite app',
    'npm exec -- tsc',
    'yarn dlx create-vite app',
    'bunx tsc',
    'git commit -m "npm install broke"',
    'grep -rn "npm install" docs',
  ])('reads %s as neither', (command) => {
    expect(installsRun(command, '/work/app')).toEqual([]);
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
    const npmProject = files('/work/app/.git', '/work/app/package-lock.json');
    expect(packageManagerGuard('Bash', { command: 'pnpm install' }, '/work/app', npmProject)).toBeDefined();
    expect(packageManagerGuard('Bash', { command: 'npm install' }, '/work/app', npmProject)).toBeUndefined();
    expect(packageManagerGuard('Bash', { command: 'pnpm install && pnpm run lint' }, '/work/app', pnpmProject)).toBeUndefined();
  });

  it('lets a global install and a one-off run through in any project', () => {
    for (const command of ['npm i -g x', 'pnpm add -g x', 'yarn global add x', 'pnpm dlx x', 'npm exec x', 'yarn dlx x']) {
      expect(packageManagerGuard('Bash', { command }, '/work/app', files('/work/app/.git', '/work/app/bun.lock'))).toBeUndefined();
    }
  });

  it('follows the nearest lockfile in a monorepo package, not the root one', () => {
    const monorepo = files('/work/app/.git', '/work/app/pnpm-lock.yaml', '/work/app/tools/cli/package-lock.json');
    expect(packageManagerGuard('Bash', { command: 'npm install' }, '/work/app/tools/cli', monorepo)).toBeUndefined();
    expect(packageManagerGuard('Bash', { command: 'pnpm install' }, '/work/app/tools/cli', monorepo)).toBeDefined();
    expect(packageManagerGuard('Bash', { command: 'npm install' }, '/work/app/packages/core', monorepo)).toBeDefined();
  });

  it('judges an install in the folder a cd earlier in the line moved to', () => {
    const mixed = files('/work/crm/.git', '/work/crm/package-lock.json', '/work/crm/storefront/pnpm-lock.yaml');
    expect(packageManagerGuard('Bash', { command: 'cd storefront && pnpm install' }, '/work/crm', mixed)).toBeUndefined();
    expect(packageManagerGuard('Bash', { command: 'cd storefront && npm install' }, '/work/crm', mixed)).toBeDefined();
    expect(packageManagerGuard('Bash', { command: 'cd /work/crm/storefront; cd .. && pnpm install' }, '/work/crm', mixed)).toBeDefined();
    expect(packageManagerGuard('Bash', { command: 'pnpm install && cd storefront' }, '/work/crm', mixed)).toBeDefined();
    expect(packageManagerGuard('Bash', { command: 'cd -P storefront && npm install' }, '/work/crm', mixed)).toBeDefined();
  });

  it('puts the folder back when a subshell holding a cd closes', () => {
    const mixed = files('/work/crm/.git', '/work/crm/package-lock.json', '/work/crm/storefront/pnpm-lock.yaml');
    expect(packageManagerGuard('Bash', { command: '(cd storefront && pnpm install) && pnpm install' }, '/work/crm', mixed)).toBeDefined();
    expect(packageManagerGuard('Bash', { command: '(cd storefront && pnpm install) && npm ci' }, '/work/crm', mixed)).toBeUndefined();
  });

  it('lets anything through in a folder with no lockfile', () => {
    expect(packageManagerGuard('Bash', { command: 'yarn add x' }, '/home/someone/scratch', files())).toBeUndefined();
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
