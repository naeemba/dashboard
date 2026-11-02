import { describe, expect, it } from 'vitest';
import { cacheUseOf, cacheWarmth } from './cache-warmth';

const MINUTE = 60_000;

describe('cacheUseOf', () => {
  it('takes the hour tier from a reply that wrote any of the hour-long cache', () => {
    const usage = { cache_creation: { ephemeral_5m_input_tokens: 10, ephemeral_1h_input_tokens: 5 } };
    expect(cacheUseOf(usage, 100, null)).toEqual({ at: 100, tier: '1h' });
  });

  it('takes the five-minute tier from a write with none of it hour-long, breakdown or not', () => {
    expect(cacheUseOf({ cache_creation: { ephemeral_5m_input_tokens: 10, ephemeral_1h_input_tokens: 0 } }, 100, { at: 50, tier: '1h' })).toEqual({ at: 100, tier: '5m' });
    expect(cacheUseOf({ cache_creation_input_tokens: 10 }, 100, null)).toEqual({ at: 100, tier: '5m' });
  });

  it('starts the clock again on a read, keeping the tier last written', () => {
    expect(cacheUseOf({ cache_read_input_tokens: 9 }, 200, { at: 100, tier: '1h' })).toEqual({ at: 200, tier: '1h' });
    expect(cacheUseOf({ cache_read_input_tokens: 9 }, 200, null)).toEqual({ at: 200, tier: '5m' });
  });

  it('changes nothing for a reply that neither wrote nor read, has no time, or is older than the last use', () => {
    const previous = { at: 100, tier: '1h' } as const;
    expect(cacheUseOf({ input_tokens: 4 }, 200, previous)).toBe(previous);
    expect(cacheUseOf({ cache_read_input_tokens: 9 }, undefined, previous)).toBe(previous);
    expect(cacheUseOf({ cache_creation_input_tokens: 9 }, 50, previous)).toBe(previous);
    expect(cacheUseOf(undefined, 200, null)).toBeNull();
  });
});

describe('cacheWarmth', () => {
  it('counts down the hour in whole minutes, green until five are left, then yellow', () => {
    const use = { at: 0, tier: '1h' } as const;
    expect(cacheWarmth(use, 18 * MINUTE)).toEqual({ text: 'warm 42m', tone: 'green', changesIn: MINUTE });
    expect(cacheWarmth(use, 18 * MINUTE + 1)).toEqual({ text: 'warm 42m', tone: 'green', changesIn: MINUTE - 1 });
    expect(cacheWarmth(use, 55 * MINUTE).tone).toBe('green');
    expect(cacheWarmth(use, 55 * MINUTE + 1)).toMatchObject({ text: 'warm 5m', tone: 'yellow' });
  });

  it('counts the last minute in seconds, and is cold with nothing more to change once expired', () => {
    const use = { at: 0, tier: '5m' } as const;
    expect(cacheWarmth(use, 4 * MINUTE)).toEqual({ text: 'warm 60s', tone: 'yellow', changesIn: 1_000 });
    expect(cacheWarmth(use, 5 * MINUTE - 500)).toEqual({ text: 'warm 1s', tone: 'yellow', changesIn: 500 });
    expect(cacheWarmth(use, 5 * MINUTE)).toEqual({ text: 'cold', tone: 'plain', changesIn: null });
  });
});
