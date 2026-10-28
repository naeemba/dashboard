import { describe, expect, it } from 'vitest';
import { pageMoves } from './page-reconcile';
import type { Project } from './projects';

const project = (path: string, missing = false): Project => ({ name: path.split('/').pop() ?? path, path, missing });

describe('pageMoves', () => {
  it('builds a page for a project that has none and removes one whose slot emptied', () => {
    const current = [{ slot: 0, project: project('/a') }, { slot: 1, project: project('/b') }];
    const moves = pageMoves(current, 'local', { host: 'local', projects: [project('/a'), null, project('/c')] });
    expect(moves).toEqual([
      { kind: 'remove', slot: 1 },
      { kind: 'build', slot: 2, project: project('/c') },
    ]);
  });

  it('does nothing twice for the same list', () => {
    const current = [{ slot: 0, project: project('/a') }];
    expect(pageMoves(current, 'local', { host: 'local', projects: [project('/a')] })).toEqual([]);
  });

  it('rebuilds a page whose project came back from missing', () => {
    const current = [{ slot: 0, project: project('/a', true) }];
    expect(pageMoves(current, 'local', { host: 'local', projects: [project('/a')] })).toEqual([
      { kind: 'remove', slot: 0 },
      { kind: 'build', slot: 0, project: project('/a') },
    ]);
  });

  it('starts over when the host changed', () => {
    const current = [{ slot: 0, project: project('/a') }];
    expect(pageMoves(current, 'local', { host: '192.168.1.5:7777', projects: [project('/x')] })).toEqual([
      { kind: 'reset' },
      { kind: 'build', slot: 0, project: project('/x') },
    ]);
  });
});
