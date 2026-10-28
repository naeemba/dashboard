import { describe, expect, it } from 'vitest';
import { paneRing } from './pane-ring';

const size = { cols: 20, rows: 5 };
const parsed = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 50));

describe('paneRing', () => {
  it('replays what was pushed, after a reset, before and after the terminal has parsed it', async () => {
    const ring = paneRing(() => size);
    ring.push('one ');
    ring.push('two');
    expect(ring.replay()).toBe('\x1bcone two');
    await parsed();
    expect(ring.replay()).toBe('\x1bcone two');
  });

  it('replays nothing when nothing was pushed', () => {
    expect(paneRing(() => size).replay()).toBe('');
  });

  it('remembers how its shell ended', () => {
    const ring = paneRing(() => size);
    expect(ring.exitCode()).toBeUndefined();
    ring.exit(127);
    expect(ring.exitCode()).toBe(127);
  });

  it('replays a full-screen program on its alternate screen with its modes, long after it switched them on', async () => {
    const ring = paneRing(() => size);
    // Mouse tracking, bracketed paste and the alternate screen, the way nvim starts.
    ring.push('\x1b[?1000h\x1b[?2004h\x1b[?1049h');
    for (let line = 0; line < 20_000; line++) ring.push(`\x1b[Hline ${line}`);
    await parsed();
    const replay = ring.replay();
    expect(replay).toContain('\x1b[?1049h');
    expect(replay).toContain('\x1b[?1000h');
    expect(replay).toContain('\x1b[?2004h');
    expect(replay).toContain('line 19999');
  });
});
