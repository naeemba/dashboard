import { execFile } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { ReadableStream } from 'node:stream/web';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import type { ReleaseAsset } from '../../shared/app/update';

// The disk and network half of the Linux and macOS update: the zip down into the user data folder, its
// size checked, unpacked beside the install, and swapped in the way scripts/rebuild.sh swaps. Windows is
// Squirrel's (update-actions.ts). release.ts holds every decision this carries out.
//
// Anything that reads or deletes an app.asar is a child process, as rebuild.sh does it: inside Electron,
// node's fs treats app.asar as a folder, so a read of it gets the archive's listing and a recursive rm
// walks into it and fails.

const run = promisify(execFile);

function remove(folder: string): Promise<unknown> {
  return run('rm', ['-rf', folder]);
}

// Into `folder` under the asset's own name. A download that is cut short, or that GitHub answers with
// something else, is a different size from the asset's, and is thrown away rather than unpacked; so is
// one whose connection dropped partway.
export async function download(asset: ReleaseAsset, folder: string): Promise<string> {
  mkdirSync(folder, { recursive: true });
  const file = path.join(folder, asset.name);
  const response = await fetch(asset.url);
  if (!response.ok || response.body === null) throw new Error(`GitHub answered ${response.status} for ${asset.name}`);
  try {
    await pipeline(Readable.fromWeb(response.body as ReadableStream), createWriteStream(file));
  } catch (error: unknown) {
    rmSync(file, { force: true });
    throw error;
  }
  const size = statSync(file).size;
  if (size !== asset.size) {
    rmSync(file, { force: true });
    throw new Error(`${asset.name} came down as ${size} bytes, not the ${asset.size} GitHub lists`);
  }
  return file;
}

// The zip unpacked into `staging`, emptied first, and the one folder it holds: Dashboard-linux-x64 or
// Dashboard.app. unzip keeps Linux's modes; ditto is how a mac unpacks a bundle whole.
export async function unpack(zip: string, staging: string, platform: NodeJS.Platform): Promise<string> {
  await remove(staging);
  mkdirSync(staging, { recursive: true });
  if (platform === 'darwin') await run('ditto', ['-x', '-k', zip, staging]);
  else await run('unzip', ['-q', zip, '-d', staging]);
  const entries = readdirSync(staging);
  if (entries.length !== 1) throw new Error(`${path.basename(zip)} held ${entries.length} entries, not one app`);
  const app = path.join(staging, entries[0]);
  // The release's zip stores its files writable by every account (v2.44.0's Dashboard is 0777), and
  // unzip keeps the stored mode: left alone, anyone on the machine could rewrite the app you run.
  await run('chmod', ['-R', 'go-w', app]);
  return app;
}

function appArchive(appFolder: string, platform: NodeJS.Platform): string {
  return path.join(appFolder, platform === 'darwin' ? 'Contents/Resources' : 'resources', 'app.asar');
}

// The stamp rebuild.sh checks, as a release has it: `<version>+` in app.asar, which keeps main.cjs as
// plain text (vite.build-version.ts). A folder that does not carry it never replaces the install.
export function carriesVersion(appFolder: string, version: string, platform: NodeJS.Platform): Promise<boolean> {
  return run('grep', ['-a', '-q', '-F', `${version}+`, appArchive(appFolder, platform)]).then(() => true, () => false);
}

// What the swap checks before it touches the install, and the restart before it asks to quit.
export async function verifyStaged(app: string, installed: string, version: string, platform: NodeJS.Platform): Promise<void> {
  if (!(await carriesVersion(app, version, platform))) {
    throw new Error(`the staged app does not carry v${version}; ${installed} is unchanged`);
  }
}

// Renamed in, never written over: a running copy pages its code in lazily, and rewriting those bytes
// underneath it kills it. After the rename the old build is only unlinked, so the running app keeps its
// own files until it restarts. A second rename that fails puts the first one back, so the next launch
// still has an app. `staging` goes with the swap, whatever it still held.
export async function swapInto(app: string, installed: string, staging: string, version: string, platform: NodeJS.Platform): Promise<void> {
  await verifyStaged(app, installed, version, platform);
  const previous = path.join(path.dirname(installed), `.${path.basename(installed)}.previous`);
  await remove(previous);
  if (existsSync(installed)) renameSync(installed, previous);
  try {
    renameSync(app, installed);
  } catch (error: unknown) {
    if (existsSync(previous)) renameSync(previous, installed);
    throw error;
  }
  await Promise.all([remove(previous), remove(staging)]);
}

// A zip fetched by the app carries no quarantine flag, but one copied in by hand might; Gatekeeper asks
// about a flagged bundle on every launch. Failing to clear it is not a failed update.
export async function clearQuarantine(bundle: string): Promise<void> {
  await run('xattr', ['-dr', 'com.apple.quarantine', bundle]).catch(() => undefined);
}
