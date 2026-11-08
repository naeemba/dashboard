import path from 'node:path';
import type { Refused } from '../../shared/app/bridge';
import { isRecord } from '../../shared/app/is-record';
import type { Release, ReleaseAsset } from '../../shared/app/update';

// Every decision of the in-app update that touches neither the disk nor the network: what GitHub's
// answer says, whether it is newer than this build, which download is this machine's, and where the
// running app is installed (docs/updates).

// Public, no token: the unauthenticated limit is 60 an hour, and a check every six hours is far under it.
export const LATEST_RELEASE_URL = 'https://api.github.com/repos/naeemba/dashboard/releases/latest';
export const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

const VERSION = /^v?(\d+)\.(\d+)\.(\d+)$/;

function asset(value: unknown): ReleaseAsset | null {
  if (!isRecord(value)) return null;
  const { name, size, browser_download_url: url } = value;
  return typeof name === 'string' && typeof size === 'number' && typeof url === 'string' ? { name, size, url } : null;
}

// The lines under the body's `## What's new`, which release-notes.mjs writes as one `- title` each.
export function releaseNotes(body: string): string[] {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === "## What's new");
  if (start === -1) return [];
  const notes: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('## ')) break;
    if (line.startsWith('- ')) notes.push(line.slice(2).trim());
  }
  return notes;
}

// GitHub's latest-release answer, or null for one that is not a release this app cut.
export function readRelease(answer: unknown): Release | null {
  if (!isRecord(answer) || typeof answer.tag_name !== 'string' || typeof answer.html_url !== 'string') return null;
  if (!VERSION.test(answer.tag_name)) return null;
  const assets = Array.isArray(answer.assets) ? answer.assets.map(asset).filter((each) => each !== null) : [];
  return {
    version: answer.tag_name.replace(/^v/, ''),
    notes: releaseNotes(typeof answer.body === 'string' ? answer.body : ''),
    url: answer.html_url,
    assets,
  };
}

function parts(version: string): number[] | null {
  const match = VERSION.exec(version.split('+')[0]);
  return match ? match.slice(1).map(Number) : null;
}

// The semver only: `running` is the build stamp, `<version>+<commit>`, and the commit is ignored, so a
// local build of main ahead of the tag never nags. A version that does not read is never newer.
export function isNewer(latest: string, running: string): boolean {
  const next = parts(latest);
  const current = parts(running);
  if (next === null || current === null) return false;
  for (let index = 0; index < 3; index += 1) {
    if (next[index] !== current[index]) return next[index] > current[index];
  }
  return false;
}

// The download for this machine, as release.yml names it. Windows updates through Squirrel, which reads
// the release's RELEASES file and fetches the nupkg it names.
export function assetName(platform: NodeJS.Platform, arch: string, version: string): string | null {
  if (platform === 'linux' && arch === 'x64') return `Dashboard-linux-x64-${version}.zip`;
  if (platform === 'darwin' && arch === 'arm64') return `Dashboard-darwin-arm64-${version}.zip`;
  if (platform === 'win32' && arch === 'x64') return 'RELEASES';
  return null;
}

export function assetFor(release: Release, platform: NodeJS.Platform, arch: string): ReleaseAsset | Refused {
  const name = assetName(platform, arch, release.version);
  if (name === null) return { refused: `v${release.version} has no download for ${platform} ${arch}; install it by hand` };
  return release.assets.find((each) => each.name === name) ?? { refused: `v${release.version} has no ${name} to download` };
}

// Why this machine cannot install `release`, or null when it can: an install the swap cannot replace (a
// development run) before a release with no download for it.
export function updateRefusal(installed: string | Refused, release: Release, platform: NodeJS.Platform, arch: string): Refused | null {
  if (typeof installed !== 'string') return installed;
  const found = assetFor(release, platform, arch);
  return 'refused' in found ? found : null;
}

// The folder an asset's download lives under: what Squirrel is pointed at.
export function releaseFolderUrl(found: ReleaseAsset): string {
  return found.url.slice(0, found.url.lastIndexOf('/'));
}

// What the swap replaces: the folder holding the executable on Linux, the .app bundle on a mac. A run
// out of a checkout is not an install: it updates by pulling and rebuilding.
export function installFolder(platform: NodeJS.Platform, executable: string, packaged: boolean): string | Refused {
  if (!packaged) return { refused: 'this is a development run; it updates by pulling and rebuilding, not from a release' };
  if (platform === 'darwin') {
    const bundle = executable.lastIndexOf('.app/');
    return bundle === -1 ? { refused: `${executable} is not inside an app bundle` } : executable.slice(0, bundle + 4);
  }
  return path.dirname(executable);
}

// Beside the install, as scripts/rebuild.sh stages, so the swap is a rename on one filesystem.
export function stagingFolder(installed: string): string {
  return path.join(path.dirname(installed), `.${path.basename(installed)}.update`);
}
