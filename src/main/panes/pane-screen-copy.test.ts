import { describe, expect, it } from 'vitest';
import { paneScreenCopy } from './pane-screen-copy';

const size = { cols: 20, rows: 5 };
const parsed = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 50));

describe('paneScreenCopy', () => {
  it('replays what was pushed, after a reset, before and after the terminal has parsed it', async () => {
    const copy = paneScreenCopy(() => size);
    copy.push('one ');
    copy.push('two');
    expect(copy.replay()).toBe('\x1bcone two');
    await parsed();
    expect(copy.replay()).toBe('\x1bcone two');
  });

  it('replays nothing when nothing was pushed', () => {
    expect(paneScreenCopy(() => size).replay()).toBe('');
  });

  it('remembers how its shell ended', () => {
    const copy = paneScreenCopy(() => size);
    expect(copy.exitCode()).toBeUndefined();
    copy.exit(127);
    expect(copy.exitCode()).toBe(127);
  });

  it('replays a full-screen program on its alternate screen with its modes, long after it switched them on', async () => {
    const copy = paneScreenCopy(() => size);
    // Mouse tracking, bracketed paste and the alternate screen, the way nvim starts.
    copy.push('\x1b[?1000h\x1b[?2004h\x1b[?1049h');
    for (let line = 0; line < 20_000; line++) copy.push(`\x1b[Hline ${line}`);
    await parsed();
    const replay = copy.replay();
    expect(replay).toContain('\x1b[?1049h');
    expect(replay).toContain('\x1b[?1000h');
    expect(replay).toContain('\x1b[?2004h');
    expect(replay).toContain('line 19999');
  });
});
