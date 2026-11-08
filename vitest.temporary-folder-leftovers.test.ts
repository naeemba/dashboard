import { describe, expect, it } from 'vitest';
import { leftoverTemporaryEntries } from './vitest.temporary-folder-leftovers';

describe('leftoverTemporaryEntries', () => {
  it('counts what tests left by the name they made it with, passing over node’s own compile caches', () => {
    expect(leftoverTemporaryEntries(['node-compile-cache', 'v8-compile-cache-1000', 'dashboard-review-a1B2c3', 'board-files-Zz9yX8', 'dashboard-review-q9W8e7']))
      .toEqual(['board-files- ×1', 'dashboard-review- ×2']);
  });

  it('finds nothing in a clean run', () => {
    expect(leftoverTemporaryEntries(['node-compile-cache'])).toEqual([]);
  });
});
