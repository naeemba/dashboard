import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { swapInto } from './install';

// The Linux swap against a throwaway folder standing in for ~/.local/opt.
const folders: string[] = [];
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }); });

function app(parent: string, name: string, stamp: string): string {
  const folder = path.join(parent, name);
  mkdirSync(path.join(folder, 'resources'), { recursive: true });
  writeFileSync(path.join(folder, 'resources', 'app.asar'), `...define("${stamp}")...`);
  return folder;
}

describe('swapInto', () => {
  it('renames the staged app over the install and clears the staging folder', async () => {
    const parent = mkdtempSync(path.join(tmpdir(), 'update-swap-'));
    folders.push(parent);
    const installed = app(parent, 'dashboard', '2.44.0+acf504ceef1b');
    const staging = path.join(parent, '.dashboard.update');
    const staged = app(staging, 'Dashboard-linux-x64', '2.45.0+0123456789ab');
    await swapInto(staged, installed, staging, '2.45.0', 'linux');
    expect(readFileSync(path.join(installed, 'resources', 'app.asar'), 'utf8')).toContain('2.45.0+');
    expect(existsSync(staging)).toBe(false);
    expect(existsSync(path.join(parent, '.dashboard.previous'))).toBe(false);
  });

  it('leaves the install alone when the staged app is another version', async () => {
    const parent = mkdtempSync(path.join(tmpdir(), 'update-swap-'));
    folders.push(parent);
    const installed = app(parent, 'dashboard', '2.44.0+acf504ceef1b');
    const staging = path.join(parent, '.dashboard.update');
    const staged = app(staging, 'Dashboard-linux-x64', '2.43.0+0123456789ab');
    await expect(swapInto(staged, installed, staging, '2.45.0', 'linux')).rejects.toThrow(`does not carry v2.45.0; ${installed} is unchanged`);
    expect(readFileSync(path.join(installed, 'resources', 'app.asar'), 'utf8')).toContain('2.44.0+');
  });
});
