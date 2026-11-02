import { cacheWarmth, type CacheUse, type CacheWarmth } from '../../shared/usage/cache-warmth';

// The status line's warm or cold, kept counting down: what it says now, and one timer for the moment
// it would say something else, redrawing the foot then. A timer that fires with the foot off screen,
// another page or another mode in front, redraws nothing and sets no other until the screen is shown
// again (`wake`), so a page out of view runs no clock.
export type CacheClock = {
  read(use: CacheUse | null): CacheWarmth | null;
  wake(): void;
};

export function createCacheClock(visible: () => boolean, redraw: () => void): CacheClock {
  let pending = false;
  let asleep = false;
  return {
    read(use) {
      const warmth = use ? cacheWarmth(use, Date.now()) : null;
      // Every paint reads, a streamed token included: one timer pending is enough, and a reply landing
      // meanwhile costs one early redraw, which sets the timer it needs.
      if (pending || asleep || warmth?.changesIn == null) return warmth;
      pending = true;
      setTimeout(() => {
        pending = false;
        asleep = !visible();
        if (!asleep) redraw();
      }, warmth.changesIn);
      return warmth;
    },
    wake() {
      asleep = false;
    },
  };
}
