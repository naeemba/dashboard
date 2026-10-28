import { describe, expect, it } from 'vitest';
import { screens, LOCAL_SCREEN } from './screens';
import { sizeOfPane, DEFAULT_PANE_SIZE } from './terminals';

describe('screens', () => {
  it('gives a shell the smallest of what every screen reports', () => {
    const all = screens();
    all.resize(LOCAL_SCREEN, '0-1', { cols: 200, rows: 50 });
    all.resize('mac', '0-1', { cols: 120, rows: 60 });
    expect(all.sizeOf('0-1')).toEqual({ cols: 120, rows: 50 });
  });

  it('goes back to the remaining screen when one leaves', () => {
    const all = screens();
    all.resize(LOCAL_SCREEN, '0-1', { cols: 200, rows: 50 });
    all.resize('mac', '0-1', { cols: 120, rows: 60 });
    all.forget('mac');
    expect(all.sizeOf('0-1')).toEqual({ cols: 200, rows: 50 });
  });

  it('answers undefined for a pane nobody has measured, and the default through sizeOfPane', () => {
    const all = screens();
    expect(all.sizeOf('0-1')).toBeUndefined();
    expect(sizeOfPane(all, '0-1')).toEqual(DEFAULT_PANE_SIZE);
  });

  it('drops a pane from every screen', () => {
    const all = screens();
    all.resize(LOCAL_SCREEN, '0-1', { cols: 80, rows: 24 });
    all.resize('mac', '0-1', { cols: 80, rows: 24 });
    all.drop('0-1');
    expect(all.sizeOf('0-1')).toBeUndefined();
  });

  it('lists the screens that have reported', () => {
    const all = screens();
    all.resize(LOCAL_SCREEN, '0-1', { cols: 80, rows: 24 });
    all.resize('mac', '0-2', { cols: 80, rows: 24 });
    expect(all.ids().sort()).toEqual(['local', 'mac']);
  });
});
