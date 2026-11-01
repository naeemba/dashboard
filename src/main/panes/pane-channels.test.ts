import { describe, expect, it } from 'vitest';
import type * as pty from 'node-pty';
import { resizeShellsToScreens } from './pane-channels';
import { screens } from './screens';

function shell(cols: number, rows: number) {
  const resizes: number[][] = [];
  const fake = { cols, rows, resize(nextCols: number, nextRows: number) { resizes.push([nextCols, nextRows]); } };
  return { fake: fake as unknown as pty.IPty, resizes };
}

describe('resizeShellsToScreens', () => {
  it('resizes a shell to the smallest size its screens report', () => {
    const one = shell(120, 40);
    const sizes = screens();
    sizes.resize('local', '0:0', { cols: 120, rows: 40 });
    sizes.resize('couch', '0:0', { cols: 100, rows: 30 });
    resizeShellsToScreens(new Map([['0:0', one.fake]]), sizes);
    expect(one.resizes).toEqual([[100, 30]]);
  });

  it('leaves a shell alone that already has that size, since every resize redraws a full-screen program', () => {
    const one = shell(120, 40);
    const sizes = screens();
    sizes.resize('local', '0:0', { cols: 120, rows: 40 });
    sizes.resize('couch', '0:0', { cols: 120, rows: 40 });
    resizeShellsToScreens(new Map([['0:0', one.fake]]), sizes);
    expect(one.resizes).toEqual([]);
  });

  it('leaves a shell nobody has measured at the size it has', () => {
    const one = shell(80, 24);
    resizeShellsToScreens(new Map([['0:0', one.fake]]), screens());
    expect(one.resizes).toEqual([]);
  });
});
