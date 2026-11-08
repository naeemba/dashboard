import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { temporaryFolder } from '../testing/temporary-folder';
import { download, swapInto, unpack } from './install';

// Lets one test make the rename of the staged app fail the way EXDEV does; every other rename is real.
const renames = vi.hoisted(() => ({ failing: '' }));
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    renameSync: (...parameters: Parameters<typeof actual.renameSync>) => {
      if (renames.failing !== '' && parameters[0] === renames.failing) throw new Error('EXDEV: cross-device link not permitted');
      return actual.renameSync(...parameters);
    },
  };
});

// The Linux download, unpack and swap against throwaway folders standing in for ~/.local/opt.
const servers: Server[] = [];
afterEach(() => {
  renames.failing = '';
  for (const server of servers.splice(0)) server.close();
});

function scratch(): string {
  return temporaryFolder('update-install-');
}

// A server that sends `sent` bytes of a body it says is `length` long, then ends or drops the connection.
async function serving(sent: number, length: number, drop: boolean): Promise<string> {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-length': length });
    // Dropped only once the first bytes are out, so fetch answers and the body is what fails.
    response.write(Buffer.alloc(sent), () => {
      if (drop) setTimeout(() => response.socket?.destroy(), 20);
      else response.end();
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/Dashboard-linux-x64-2.45.0.zip`;
}

describe('download', () => {
  it('keeps a download of the listed size', async () => {
    const folder = scratch();
    const url = await serving(64, 64, false);
    const file = await download({ name: 'Dashboard-linux-x64-2.45.0.zip', size: 64, url }, folder);
    expect(statSync(file).size).toBe(64);
  });

  it('throws away one that comes down short, or whose connection drops', async () => {
    const folder = scratch();
    const short = await serving(32, 32, false);
    await expect(download({ name: 'Dashboard-linux-x64-2.45.0.zip', size: 64, url: short }, folder)).rejects.toThrow('came down as 32 bytes, not the 64');
    expect(readdirSync(folder)).toEqual([]);
    const dropped = await serving(32, 64, true);
    await expect(download({ name: 'Dashboard-linux-x64-2.45.0.zip', size: 64, url: dropped }, folder)).rejects.toThrow('terminated');
    expect(readdirSync(folder)).toEqual([]);
  });
});

// zip and unzip, as a Linux install has them; Windows updates through Squirrel and never unpacks.
describe.skipIf(process.platform === 'win32')('unpack', () => {
  function zipped(parent: string, entries: string[]): string {
    const source = path.join(parent, 'source');
    for (const entry of entries) {
      mkdirSync(path.join(source, entry), { recursive: true });
      writeFileSync(path.join(source, entry, 'dashboard'), '');
      chmodSync(path.join(source, entry, 'dashboard'), 0o777);
    }
    const zip = path.join(parent, 'release.zip');
    execFileSync('zip', ['-q', '-r', zip, ...entries], { cwd: source });
    return zip;
  }

  it('takes write access off for other accounts', async () => {
    const parent = scratch();
    const app = await unpack(zipped(parent, ['Dashboard-linux-x64']), path.join(parent, 'staging'), 'linux');
    expect(statSync(path.join(app, 'dashboard')).mode & 0o022).toBe(0);
  });

  it('refuses a zip that is not one app', async () => {
    const parent = scratch();
    await expect(unpack(zipped(parent, ['one', 'two']), path.join(parent, 'staging'), 'linux')).rejects.toThrow('held 2 entries, not one app');
  });
});

function app(parent: string, name: string, stamp: string): string {
  const folder = path.join(parent, name);
  mkdirSync(path.join(folder, 'resources'), { recursive: true });
  writeFileSync(path.join(folder, 'resources', 'app.asar'), `...define("${stamp}")...`);
  return folder;
}

describe('swapInto', () => {
  it('renames the staged app over the install and clears the staging folder', async () => {
    const parent = temporaryFolder('update-swap-');
    const installed = app(parent, 'dashboard', '2.44.0+acf504ceef1b');
    const staging = path.join(parent, '.dashboard.update');
    const staged = app(staging, 'Dashboard-linux-x64', '2.45.0+0123456789ab');
    await swapInto(staged, installed, staging, '2.45.0', 'linux');
    expect(readFileSync(path.join(installed, 'resources', 'app.asar'), 'utf8')).toContain('2.45.0+');
    expect(existsSync(staging)).toBe(false);
    expect(existsSync(path.join(parent, '.dashboard.previous'))).toBe(false);
  });

  it('leaves the install alone when the staged app is another version', async () => {
    const parent = temporaryFolder('update-swap-');
    const installed = app(parent, 'dashboard', '2.44.0+acf504ceef1b');
    const staging = path.join(parent, '.dashboard.update');
    const staged = app(staging, 'Dashboard-linux-x64', '2.43.0+0123456789ab');
    await expect(swapInto(staged, installed, staging, '2.45.0', 'linux')).rejects.toThrow(`does not carry v2.45.0; ${installed} is unchanged`);
    expect(readFileSync(path.join(installed, 'resources', 'app.asar'), 'utf8')).toContain('2.44.0+');
  });

  it('puts the install back when the staged app cannot be renamed in', async () => {
    const parent = temporaryFolder('update-swap-');
    const installed = app(parent, 'dashboard', '2.44.0+acf504ceef1b');
    const staging = path.join(parent, '.dashboard.update');
    const staged = app(staging, 'Dashboard-linux-x64', '2.45.0+0123456789ab');
    renames.failing = staged;
    await expect(swapInto(staged, installed, staging, '2.45.0', 'linux')).rejects.toThrow('EXDEV');
    expect(readFileSync(path.join(installed, 'resources', 'app.asar'), 'utf8')).toContain('2.44.0+');
    expect(existsSync(path.join(parent, '.dashboard.previous'))).toBe(false);
  });
});
