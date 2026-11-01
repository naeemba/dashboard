import { describe, expect, it } from 'vitest';
import { hostTracker, landingAfterMoves, pageMoves } from './page-reconcile';
import type { Project } from '../../main/app/projects';

const project = (path: string, missing = false): Project => ({ name: path.split('/').pop() ?? path, path, missing });

describe('pageMoves', () => {
  it('builds a page for a project that has none and removes one whose slot emptied', () => {
    const current = [{ slot: 0, project: project('/a') }, { slot: 1, project: project('/b') }];
    const moves = pageMoves(current, { projects: [project('/a'), null, project('/c')], panes: [] });
    expect(moves).toEqual([
      { kind: 'remove', slot: 1 },
      { kind: 'build', slot: 2, project: project('/c') },
    ]);
  });

  it('does nothing twice for the same list', () => {
    const current = [{ slot: 0, project: project('/a') }];
    expect(pageMoves(current, { projects: [project('/a')], panes: [] })).toEqual([]);
  });

  it('rebuilds a page whose project came back from missing', () => {
    const current = [{ slot: 0, project: project('/a', true) }];
    expect(pageMoves(current, { projects: [project('/a')], panes: [] })).toEqual([
      { kind: 'rebuild', slot: 0, project: project('/a') },
    ]);
  });

  it('rebuilds in place when a slot holds a different project', () => {
    const current = [{ slot: 0, project: project('/a') }];
    expect(pageMoves(current, { projects: [project('/b')], panes: [] })).toEqual([
      { kind: 'rebuild', slot: 0, project: project('/b') },
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

  it('lands on 0 when no page is left', () => {
    const moves = [{ kind: 'remove', slot: 0 }] as const;
    expect(landingAfterMoves(0, [...moves], positions([]), 0, 0)).toEqual({ position: 0, takeFocus: true });
  });

  it('stays put when nothing moved', () => {
    expect(landingAfterMoves(1, [], positions([0, 1]), 1, 2)).toEqual({ position: 1, takeFocus: false });
  });
});

describe('hostTracker', () => {
  const current = [{ slot: 0, project: project('/a') }, { slot: 1, project: project('/b') }];

  it('reconciles as usual while the host stays the same, and takes a repeat of it as nothing', () => {
    const hosts = hostTracker();
    hosts.change('local');
    expect(hosts.movesFor(current, { projects: [project('/a'), project('/b')], panes: [] })).toEqual({ moves: [], home: false });
  });

  it('replaces every page with the first list of a new host, then reconciles again', () => {
    const hosts = hostTracker();
    hosts.change('10.0.0.2:7777');
    hosts.change('10.0.0.2:7777');
    expect(hosts.host()).toBe('10.0.0.2:7777');
    expect(hosts.movesFor(current, { projects: [project('/a')], panes: [] })).toEqual({
      moves: [{ kind: 'remove', slot: 0 }, { kind: 'remove', slot: 1 }, { kind: 'build', slot: 0, project: project('/a') }],
      home: false,
    });
    expect(hosts.movesFor([{ slot: 0, project: project('/a') }], { projects: [project('/a')], panes: [] }).moves).toEqual([]);
  });

  it('says when a list brings this machine back, so its layout can be put back on the bare pages', () => {
    const hosts = hostTracker();
    hosts.change('10.0.0.2:7777');
    hosts.movesFor(current, { projects: [project('/x')], panes: [] });
    hosts.change('local');
    const { moves, home } = hosts.movesFor([{ slot: 0, project: project('/x') }], { projects: [project('/a')], panes: [] });
    expect(home).toBe(true);
    expect(moves).toEqual([{ kind: 'remove', slot: 0 }, { kind: 'build', slot: 0, project: project('/a') }]);
  });

  it('lands on the page of the same slot after a host change, as an arrival', () => {
    const hosts = hostTracker();
    hosts.change('10.0.0.2:7777');
    const { moves } = hosts.movesFor(current, { projects: [project('/x'), project('/y')], panes: [] });
    const position = (slot: number | null) => (slot === null ? -1 : slot + 1);
    expect(landingAfterMoves(1, moves, position, 2, 3)).toEqual({ position: 2, takeFocus: true });
  });
});

