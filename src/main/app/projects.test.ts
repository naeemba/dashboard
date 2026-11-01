import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { projectFromPath, readRecentPaths, rememberRecentPath, replacesProject, withRecentPath } from './projects';

const exists = () => true;

describe('projectFromPath', () => {
  it('names a project by its last path segment', () => {
    expect(projectFromPath('/code/api', exists).name).toBe('api');
  });

  it('normalises paths so a trailing slash is the same project as without one', () => {
    expect(projectFromPath('/code/api/', exists)).toEqual(projectFromPath('/code/api', exists));
  });

  it('flags a directory that does not exist', () => {
    expect(projectFromPath('/gone', (path) => path === '/here').missing).toBe(true);
  });

  it('treats a file path as missing', () => {
    expect(projectFromPath(__filename).missing).toBe(true);
    expect(projectFromPath(__dirname).missing).toBe(false);
  });
});

describe('replacesProject', () => {
  const live = { name: 'api', path: '/code/api', missing: false };
  const missing = { name: 'api', path: '/code/api', missing: true };

  it('fills an empty slot', () => {
    expect(replacesProject(undefined, live)).toBe(true);
  });

  it('upgrades a project that was missing at launch', () => {
    expect(replacesProject(missing, live)).toBe(true);
  });

  it('leaves a project that already works alone', () => {
    expect(replacesProject(live, live)).toBe(false);
  });

  it('does not downgrade a live project to a missing one', () => {
    expect(replacesProject(live, missing)).toBe(false);
  });
});

describe('withRecentPath', () => {
  it('puts the newest path first', () => {
    expect(withRecentPath(['/code/web'], '/code/api')).toEqual(['/code/api', '/code/web']);
  });

  it('moves a path already in the list instead of repeating it', () => {
    expect(withRecentPath(['/code/web', '/code/api'], '/code/api')).toEqual(['/code/api', '/code/web']);
  });

  it('keeps the twenty most recent', () => {
    const paths = Array.from({ length: 25 }, (_unused, index) => `/code/${index}`);
    const kept = withRecentPath(paths, '/code/new');
    expect(kept).toHaveLength(20);
    expect(kept.at(-1)).toBe('/code/18');
  });
});

describe('the recents file', () => {
  const file = () => join(mkdtempSync(join(tmpdir(), 'dashboard-')), 'recents.json');

  it('returns nothing when the file is missing', () => {
    expect(readRecentPaths('/does/not/exist.json')).toEqual([]);
  });

  it('returns nothing when the file is damaged', () => {
    const path = file();
    writeFileSync(path, '{ not json');
    expect(readRecentPaths(path)).toEqual([]);
  });

  it('ignores entries that are not paths', () => {
    const path = file();
    writeFileSync(path, JSON.stringify(['/code/api', 7, null, { path: '/code/web' }]));
    expect(readRecentPaths(path)).toEqual(['/code/api']);
  });

  it('does not throw when the file cannot be written', () => {
    expect(() => rememberRecentPath('/does/not/exist/recents.json', '/code/api')).not.toThrow();
  });

  it('reads back what it wrote, newest first', () => {
    const path = file();
    rememberRecentPath(path, '/code/api');
    rememberRecentPath(path, '/code/web');
    rememberRecentPath(path, '/code/api');
    expect(readRecentPaths(path)).toEqual(['/code/api', '/code/web']);
  });
});
