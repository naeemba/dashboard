import { describe, expect, it, vi } from 'vitest';
import type { PaneShell } from './pane-shell';
import { panePrompts, resizeShellsToScreens } from './pane-channels';
import { screens } from '../../shared/remote-host/screens';

function shell(cols: number, rows: number) {
  const resizes: number[][] = [];
  const fake = { cols, rows, resize(nextCols: number, nextRows: number) { resizes.push([nextCols, nextRows]); } };
  return { fake: fake as unknown as PaneShell, resizes };
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

describe('panePrompts', () => {
  it('prompts a Claude screen, and types into the shell of a pane that is none, Enter a moment after', () => {
    vi.useFakeTimers();
    const written: string[] = [];
    const prompted: string[] = [];
    const { promptPane } = panePrompts(
      (id) => (id === '2:2' ? { write: (data) => { written.push(data); } } : undefined),
      (id, text) => id === '2:1' && prompted.push(`${id} ${text}`) > 0,
    );
    promptPane('2:1', 'close it');
    promptPane('2:2', 'close it');
    promptPane('2:9', 'close it');
    vi.runAllTimers();
    vi.useRealTimers();
    expect(prompted).toEqual(['2:1 close it']);
    expect(written).toEqual(['close it', '\r']);
  });
});
