import { describe, expect, it } from 'vitest';
import { changelogWith, downloadsSection, releaseBody } from './release-notes.mjs';

describe('changelogWith', () => {
  it('starts a changelog that does not exist yet', () => {
    expect(changelogWith('', 'v2.42.0', '2026-11-06', '* First\n')).toBe('# Changelog\n\n## v2.42.0 (2026-11-06)\n\n* First\n');
  });

  it('puts the new section above the older ones', () => {
    const old = '# Changelog\n\n## v2.42.0 (2026-11-06)\n\n* First\n';
    expect(changelogWith(old, 'v2.42.1', '2026-11-07', '* Second')).toBe(
      '# Changelog\n\n## v2.42.1 (2026-11-07)\n\n* Second\n\n## v2.42.0 (2026-11-06)\n\n* First\n',
    );
  });
});

describe('downloadsSection', () => {
  const assets = [
    'Dashboard-2.42.0-arm64.dmg',
    'Dashboard-darwin-arm64-2.42.0.zip',
    'Dashboard-2.42.0.Setup.exe',
    'RELEASES',
    'dashboard-2.42.0-full.nupkg',
    'dashboard_2.42.0_amd64.deb',
    'dashboard-2.42.0-1.x86_64.rpm',
    'Dashboard-linux-x64-2.42.0.zip',
  ];

  it('gives each platform one line and leaves the Squirrel feed out', () => {
    const section = downloadsSection(assets, 'naeemba/dashboard', 'v2.42.0');
    const base = 'https://github.com/naeemba/dashboard/releases/download/v2.42.0/';
    expect(section.split('\n').filter((line) => line.startsWith('- '))).toEqual([
      `- macOS (Apple silicon): [dmg](${base}Dashboard-2.42.0-arm64.dmg) · [zip](${base}Dashboard-darwin-arm64-2.42.0.zip)`,
      `- Windows (x64): [installer](${base}Dashboard-2.42.0.Setup.exe)`,
      `- Linux (x64): [deb](${base}dashboard_2.42.0_amd64.deb) · [rpm](${base}dashboard-2.42.0-1.x86_64.rpm) · [zip](${base}Dashboard-linux-x64-2.42.0.zip)`,
    ]);
  });

  it('leaves out a platform with no file', () => {
    expect(downloadsSection(['dashboard_2.42.0_amd64.deb'], 'o/r', 'v1')).not.toContain('macOS');
  });
});

describe('releaseBody', () => {
  it('lists the downloads, then the unsigned steps, then the notes', () => {
    const body = releaseBody("## What's Changed\n* A\n", ['x.dmg'], 'o/r', 'v1');
    expect(body.indexOf('## Downloads')).toBeLessThan(body.indexOf('## Unsigned builds'));
    expect(body.indexOf('## Unsigned builds')).toBeLessThan(body.indexOf("## What's Changed"));
  });
});
