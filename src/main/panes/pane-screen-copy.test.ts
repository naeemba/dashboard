import { describe, expect, it } from 'vitest';
import { paneScreenCopy, screenCopyWhile } from './pane-screen-copy';

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

describe('screenCopyWhile', () => {
  it('keeps nothing while nobody will read it', () => {
    const copy = screenCopyWhile(() => false, () => size);
    copy.push('flood');
    expect(copy.replay()).toBe('');
  });

  it('starts from the first byte after it is wanted, without what came before', () => {
    let wanted = false;
    const copy = screenCopyWhile(() => wanted, () => size);
    copy.push('before ');
    wanted = true;
    copy.push('after');
    expect(copy.replay()).toBe('\x1bcafter');
  });

  it('holds its screen for a replay asked before the next byte, and drops it at the byte after it stops being wanted', () => {
    let wanted = true;
    const copy = screenCopyWhile(() => wanted, () => size);
    copy.push('away');
    wanted = false;
    expect(copy.replay()).toBe('\x1bcaway');
    copy.push('home');
    expect(copy.replay()).toBe('');
  });

  it('keeps how its shell ended across a change', () => {
    let wanted = false;
    const copy = screenCopyWhile(() => wanted, () => size);
    copy.exit(3);
    wanted = true;
    copy.push('x');
    expect(copy.exitCode()).toBe(3);
  });
});
