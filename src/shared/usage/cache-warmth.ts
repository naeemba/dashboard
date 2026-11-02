// Whether a session's prompt cache is still warm, and for how long, from the usage its own replies
// carry. No call is made to find out: every assistant message says what it wrote to the cache and
// what it read from it, and the cache lives a fixed time after the last request that did either
// (docs/chat/decisions.md, chat-decision-12, quotes Anthropic's prompt caching page on this).

export type CacheTier = '5m' | '1h';

// The last request that wrote or read the cache, and the lifetime the session last wrote with.
export type CacheUse = { at: number; tier: CacheTier };

// The cache counters on a reply's usage, spelled as the API spells them. All optional: an older
// Claude Code writes only the flat creation count, without the per-tier breakdown.
export type CacheCounters = {
  cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number } | null;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};

const TIER_MS: Record<CacheTier, number> = { '5m': 5 * 60_000, '1h': 60 * 60_000 };

const MINUTE = 60_000;
const SECOND = 1_000;

// Under this much left the pill turns yellow: the next prompt had better come soon.
const SOON_MS = 5 * MINUTE;

const count = (value: unknown): number => (typeof value === 'number' ? value : 0);

// What one reply at `at` makes of the cache use before it. A reply that wrote names the tier: 1h if
// any of it went to the hour-long cache, else 5m. One that only read keeps the tier last written, or
// 5m when no write has been seen, the shorter guess. One that did neither changes nothing, and nor
// does a reply older than the use already known, so earlier history read in after a live reply
// cannot set the clock back.
// ponytail: the lifetime runs from the start of the request, and `at` is when the reply was written,
// so a long reply reads up to its own length too warm. Track the request's start if that shows.
export function cacheUseOf(usage: unknown, at: number | undefined, previous: CacheUse | null): CacheUse | null {
  if (at === undefined || typeof usage !== 'object' || usage === null) return previous;
  if (previous && at < previous.at) return previous;
  const counters = usage as CacheCounters;
  const wroteHour = count(counters.cache_creation?.ephemeral_1h_input_tokens);
  const wrote = wroteHour + count(counters.cache_creation?.ephemeral_5m_input_tokens) + count(counters.cache_creation_input_tokens);
  if (wroteHour > 0) return { at, tier: '1h' };
  if (wrote > 0) return { at, tier: '5m' };
  if (count(counters.cache_read_input_tokens) > 0) return { at, tier: previous?.tier ?? '5m' };
  return previous;
}

export type CacheTone = 'green' | 'yellow' | 'plain';

// What the pill says now, its colour, and how long until it says something else: the next whole
// minute, or the next second in the last minute. Null once cold, when nothing more will change.
export type CacheWarmth = { text: string; tone: CacheTone; changesIn: number | null };

export function cacheWarmth(use: CacheUse, now: number): CacheWarmth {
  const left = use.at + TIER_MS[use.tier] - now;
  if (left <= 0) return { text: 'cold', tone: 'plain', changesIn: null };
  const tone = left < SOON_MS ? 'yellow' : 'green';
  if (left > MINUTE) return { text: `warm ${Math.ceil(left / MINUTE)}m`, tone, changesIn: ((left - 1) % MINUTE) + 1 };
  return { text: `warm ${Math.ceil(left / SECOND)}s`, tone, changesIn: ((left - 1) % SECOND) + 1 };
}
