import { cacheWarmth, type CacheUse, type CacheWarmth } from '../../shared/usage/cache-warmth';

// The status line's warm or cold, kept counting down: what it says now, and one timer for the moment
// it would say something else, redrawing the foot then. No timer is set while the foot is off screen,
// another page or another mode in front; showing the screen again draws the foot, which reads here.
export type CacheClock = { read(use: CacheUse | null): CacheWarmth | null };

export function createCacheClock(foot: HTMLElement, redraw: () => void): CacheClock {
  let timer = 0;
  return {
    read(use) {
      const warmth = use ? cacheWarmth(use, Date.now()) : null;
      // Every paint reads, a streamed token included: one timer pending is enough, and a reply landing
      // meanwhile costs one early redraw, which sets the timer it needs.
      if (timer || warmth?.changesIn == null || document.hidden || !foot.checkVisibility()) return warmth;
      timer = window.setTimeout(() => {
        timer = 0;
        redraw();
      }, warmth.changesIn);
      return warmth;
    },
  };
}
