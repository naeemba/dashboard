import { describe, expect, it } from 'vitest';
import { cardsReachedDone, changelogWith, downloadsSection, notesWithWhatsNew, releaseBody } from './release-notes.mjs';

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

  it('keeps a changelog whose header was edited by hand, below the new header', () => {
    expect(changelogWith('Old notes\n', 'v1', 'd', '* A')).toBe('# Changelog\n\n## v1 (d)\n\n* A\n\nOld notes\n');
  });

  it("nests the notes' headings under their version", () => {
    expect(changelogWith('', 'v1', 'd', "## What's Changed\n* A\n")).toBe("# Changelog\n\n## v1 (d)\n\n### What's Changed\n* A\n");
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
    const section = downloadsSection(['dashboard_2.42.0_amd64.deb'], 'o/r', 'v1');
    expect(section).not.toContain('macOS');
    expect(section).toContain('- Linux (x64): [deb](https://github.com/o/r/releases/download/v1/dashboard_2.42.0_amd64.deb)');
  });
});

describe('releaseBody', () => {
  it('lists the downloads, then the unsigned steps, then the notes', () => {
    const body = releaseBody("## What's Changed\n* A\n", ['x.dmg'], 'o/r', 'v1');
    expect(body.indexOf('## Downloads')).toBeLessThan(body.indexOf('## Unsigned builds'));
    expect(body.indexOf('## Unsigned builds')).toBeLessThan(body.indexOf("## What's Changed"));
    expect(body).toContain('https://github.com/o/r#install');
  });
});

describe('cardsReachedDone', () => {
  const card = (id, column, extra = {}) => ({ id, title: `Card ${id}`, column, updatedAt: '2026-11-01', ...extra });

  it('counts a card new in Done and one that moved into Done, not one already there', () => {
    const before = [card('a', 'Done'), card('b', 'Doing')];
    const now = [card('a', 'Done'), card('b', 'Done'), card('c', 'Done'), card('d', 'Review')];
    expect(cardsReachedDone(before, now).map((done) => done.id)).toEqual(['b', 'c']);
  });

  it('leaves a subtask to its parent', () => {
    expect(cardsReachedDone([], [card('a', 'Done', { parent: 'p' })])).toEqual([]);
  });

  it('lists the oldest move first', () => {
    const now = [card('late', 'Done', { updatedAt: '2026-11-07' }), card('early', 'Done', { updatedAt: '2026-11-02' })];
    expect(cardsReachedDone([], now).map((done) => done.id)).toEqual(['early', 'late']);
  });
});

describe('notesWithWhatsNew', () => {
  it("puts the card titles above GitHub's list", () => {
    expect(notesWithWhatsNew("## What's Changed\n* A\n", [{ title: 'One' }, { title: 'Two' }])).toBe(
      "## What's new\n\n- One\n- Two\n\n## What's Changed\n* A\n",
    );
  });

  it('leaves the notes alone when no card reached Done', () => {
    expect(notesWithWhatsNew('* A\n', [])).toBe('* A\n');
  });
});
