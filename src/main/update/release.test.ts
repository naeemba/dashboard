import { describe, expect, it } from 'vitest';
import { assetFor, installFolder, isNewer, readRelease, releaseFolderUrl, stagingFolder, updateRefusal } from './release';

const DOWNLOAD = 'https://github.com/naeemba/dashboard/releases/download/v2.45.0';
const ANSWER = {
  tag_name: 'v2.45.0',
  html_url: 'https://github.com/naeemba/dashboard/releases/tag/v2.45.0',
  body: "## Downloads\n\n- macOS: [zip](x)\n\n## What's new\n\n- One update action\n- Fix the board\n\n## Other\n\n- not a note\n",
  assets: [
    { name: 'Dashboard-linux-x64-2.45.0.zip', size: 10, browser_download_url: `${DOWNLOAD}/Dashboard-linux-x64-2.45.0.zip` },
    { name: 'RELEASES', size: 81, browser_download_url: `${DOWNLOAD}/RELEASES` },
    { name: 'broken' },
  ],
};

describe('readRelease', () => {
  it('reads the version, the What\'s new lines and the assets', () => {
    expect(readRelease(ANSWER)).toEqual({
      version: '2.45.0',
      notes: ['One update action', 'Fix the board'],
      url: ANSWER.html_url,
      assets: [
        { name: 'Dashboard-linux-x64-2.45.0.zip', size: 10, url: `${DOWNLOAD}/Dashboard-linux-x64-2.45.0.zip` },
        { name: 'RELEASES', size: 81, url: `${DOWNLOAD}/RELEASES` },
      ],
    });
  });

  it('refuses an answer that is not a release', () => {
    expect(readRelease({ message: 'API rate limit exceeded' })).toBeNull();
    expect(readRelease({ ...ANSWER, tag_name: 'nightly' })).toBeNull();
  });
});

describe('isNewer', () => {
  it('compares the semver and ignores the commit stamp', () => {
    expect(isNewer('2.45.0', '2.44.0+acf504ceef1b')).toBe(true);
    expect(isNewer('2.44.0', '2.44.0+0123456789ab')).toBe(false);
    expect(isNewer('2.44.0', '2.45.0+0123456789ab')).toBe(false);
    expect(isNewer('2.10.0', '2.9.9+unknown')).toBe(true);
    expect(isNewer('3.0.0', 'garbage')).toBe(false);
  });
});

describe('assetFor', () => {
  const release = readRelease(ANSWER)!;

  it('picks the zip on Linux and RELEASES on Windows', () => {
    expect(assetFor(release, 'linux', 'x64')).toMatchObject({ name: 'Dashboard-linux-x64-2.45.0.zip', size: 10 });
    const windows = assetFor(release, 'win32', 'x64');
    expect('url' in windows && releaseFolderUrl(windows)).toBe(DOWNLOAD);
  });

  it('refuses a machine the release has no download for', () => {
    expect(assetFor(release, 'linux', 'arm64')).toEqual({ refused: 'v2.45.0 has no download for linux arm64; install it by hand' });
    expect(assetFor(release, 'darwin', 'arm64')).toEqual({ refused: 'v2.45.0 has no Dashboard-darwin-arm64-2.45.0.zip to download' });
  });
});

describe('installFolder', () => {
  it('is the executable\'s folder on Linux and the bundle on a mac', () => {
    expect(installFolder('linux', '/home/me/.local/opt/dashboard/Dashboard', true)).toBe('/home/me/.local/opt/dashboard');
    expect(installFolder('darwin', '/Applications/Dashboard.app/Contents/MacOS/Dashboard', true)).toBe('/Applications/Dashboard.app');
    expect(stagingFolder('/home/me/.local/opt/dashboard')).toBe('/home/me/.local/opt/.dashboard.update');
  });

  it('refuses a development run', () => {
    expect(installFolder('linux', '/repo/node_modules/electron/dist/electron', false)).toHaveProperty('refused');
  });
});

describe('updateRefusal', () => {
  const release = readRelease(ANSWER)!;

  it('refuses a development run before a missing download, and lets an install with its download through', () => {
    const development = { refused: 'this is a development run' };
    expect(updateRefusal(development, release, 'linux', 'arm64')).toBe(development);
    expect(updateRefusal('/opt/dashboard', release, 'linux', 'arm64')).toEqual({ refused: 'v2.45.0 has no download for linux arm64; install it by hand' });
    expect(updateRefusal('/opt/dashboard', release, 'linux', 'x64')).toBeNull();
  });
});
