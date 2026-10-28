import { describe, expect, it } from 'vitest';
import { landingAfterMoves, pageMoves } from './page-reconcile';
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
      { kind: 'rebuild', slot: 0, project: project('/a') },
    ]);
  });

  it('rebuilds in place when a slot holds a different project', () => {
    const current = [{ slot: 0, project: project('/a') }];
    expect(pageMoves(current, 'local', { host: 'local', projects: [project('/b')] })).toEqual([
      { kind: 'rebuild', slot: 0, project: project('/b') },
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

describe('landingAfterMoves', () => {
  const positions = (slots: number[]) => (slot: number | null) => slots.indexOf(slot as number);

  it('lands on the neighbour when the page you stood on went', () => {
    const moves = [{ kind: 'remove', slot: 2 }] as const;
    expect(landingAfterMoves(2, [...moves], positions([0, 1]), 2, 2)).toEqual({ position: 1, takeFocus: true });
  });

  it('lands on the replacement when the page was rebuilt', () => {
    const moves = [{ kind: 'rebuild', slot: 1, project: project('/b') }] as const;
    expect(landingAfterMoves(1, [...moves], positions([0, 1]), 1, 2)).toEqual({ position: 1, takeFocus: true });
  });

  it('follows a page shifted by an earlier removal without taking focus', () => {
    const moves = [{ kind: 'remove', slot: 1 }] as const;
    expect(landingAfterMoves(2, [...moves], positions([0, 2]), 2, 2)).toEqual({ position: 1, takeFocus: false });
  });

  it('stays put when nothing moved', () => {
    expect(landingAfterMoves(1, [], positions([0, 1]), 1, 2)).toEqual({ position: 1, takeFocus: false });
  });
});
