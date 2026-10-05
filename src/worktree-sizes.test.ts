import { describe, expect, it } from 'vitest';
import { SIZE_STALE_MS } from './git-worktrees';
import { createWorktreeSizes } from './worktree-sizes';

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function harness() {
  let now = 1_000;
  const walks: { path: string; finish: (bytes: number | null) => void; fail: () => void }[] = [];
  const sizes = createWorktreeSizes({
    now: () => now,
    measure: (path) => new Promise((resolve, reject) => {
      walks.push({ path, finish: resolve, fail: () => reject(new Error('du')) });
    }),
  });
  return { sizes, walks, advance: (ms: number) => { now += ms; } };
}

describe('createWorktreeSizes', () => {
  it('answers null until the first walk lands, then the number', async () => {
    const { sizes, walks } = harness();
    expect(sizes.sizeOf('/w')).toBeNull();
    await settle();
    walks[0].finish(2048);
    await settle();
    expect(sizes.sizeOf('/w')).toBe(2048);
  });

  it('does not queue a second walk of a folder still being walked', async () => {
    const { sizes, walks, advance } = harness();
    sizes.sizeOf('/w');
    advance(SIZE_STALE_MS * 2);
    sizes.sizeOf('/w');
    await settle();
    expect(walks).toHaveLength(1);
  });

  it('walks one folder at a time', async () => {
    const { sizes, walks } = harness();
    sizes.sizeOf('/a');
    sizes.sizeOf('/b');
    await settle();
    expect(walks.map((walk) => walk.path)).toEqual(['/a']);
    walks[0].finish(1);
    await settle();
    expect(walks.map((walk) => walk.path)).toEqual(['/a', '/b']);
  });

  it('walks a folder again only once its size is stale', async () => {
    const { sizes, walks, advance } = harness();
    sizes.sizeOf('/w');
    await settle();
    walks[0].finish(1);
    await settle();
    advance(SIZE_STALE_MS - 1);
    sizes.sizeOf('/w');
    advance(1);
    sizes.sizeOf('/w');
    await settle();
    expect(walks).toHaveLength(2);
  });

  it('says a walk that gave no number could not measure, and keeps measuring the rest after a failure', async () => {
    const { sizes, walks } = harness();
    sizes.sizeOf('/gone');
    sizes.sizeOf('/broken');
    sizes.sizeOf('/w');
    await settle();
    walks[0].finish(null);
    await settle();
    walks[1].fail();
    await settle();
    walks[2].finish(7);
    await settle();
    expect([sizes.sizeOf('/gone'), sizes.sizeOf('/broken'), sizes.sizeOf('/w')]).toEqual(['unmeasurable', 'unmeasurable', 7]);
  });

  it('drops a walk that started before the folder was forgotten', async () => {
    const { sizes, walks } = harness();
    sizes.sizeOf('/w');
    await settle();
    sizes.forget('/w');
    walks[0].finish(999);
    await settle();
    expect(sizes.sizeOf('/w')).toBeNull();
    await settle();
    expect(walks).toHaveLength(2);
  });
});
