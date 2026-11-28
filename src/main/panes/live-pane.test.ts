import { describe, expect, it } from 'vitest';
import { MANAGER_SLOT } from '../../shared/manager/manager';
import { livePane } from './live-pane';

describe('livePane', () => {
  const ports = { slotOf: (folder: string) => (folder === '/work/web' ? 0 : -1) };

  it('keeps the manager\'s pane, and refuses what is no pane id', () => {
    expect(livePane(ports, `${MANAGER_SLOT}:1`, '/home/me')).toBe(`${MANAGER_SLOT}:1`);
    expect(livePane(ports, 'nobody', '/work/web')).toEqual({ refused: 'pane nobody is not open in this app' });
    expect(livePane(ports, '1:1', '/work/web')).toBe('0:1');
  });

  it('refuses a pane whose project is not open', () => {
    expect(livePane(ports, '1:1', '/work/gone')).toEqual({ refused: 'pane 1:1 is of /work/gone, which is not open in this app' });
  });
});
