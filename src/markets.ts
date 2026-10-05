// The four cards across the top of the manager page: what each source answers, turned into what a card
// draws. Main fetches (markets-fetch.ts) and the renderer draws (markets-view.ts); everything that could
// be wrong about the numbers is here, where it can be tested without a network.

// A price over time, oldest first: [milliseconds since the epoch, price].
export type Series = readonly (readonly [number, number])[];
// Changes are percentages, null where the series does not reach back that far.
export type Quote = {
  price: number; day: number | null; week: number | null; month: number | null; year: number | null;
};
export type Place = { name: string; latitude: number; longitude: number };
export type Forecast = { place: string; condition: string; low: number; high: number; rain: number | null };
// One card's answer. A failure carries the sentence to print, so one source being down costs that card
// alone.
export type Reading<T> = { ok: true; value: T } | { ok: false; message: string };
export type MarketsSnapshot = {
  weather: Reading<Forecast>; btc: Reading<Quote>; usdt: Reading<Quote>; gold: Reading<Quote>;
};

const DAY_MS = 86_400_000;

// Each change compares the latest price with the price exactly that many days earlier, read along the
// line between the two points either side of it. CoinGecko's points sit at midnight with the latest at
// the current time, so taking the point before instead would make "1d" at noon a day and a half. A
// series that starts less than a day short of the span still answers from its oldest point: CoinGecko's
// year starts at midnight 364 days back, and a year card that never showed a year would be no use.
export function quoteOf(series: Series): Quote {
  if (series.length === 0) throw new Error('No prices in the answer');
  const [latestAt, price] = series[series.length - 1];
  const change = (days: number): number | null => {
    const target = latestAt - days * DAY_MS;
    const after = series.findIndex(([at]) => at > target);
    let then: number | undefined;
    if (after > 0) {
      const [beforeAt, beforeValue] = series[after - 1];
      const [afterAt, afterValue] = series[after];
      then = beforeValue + (afterValue - beforeValue) * (target - beforeAt) / (afterAt - beforeAt);
    }
    if (then === undefined && series[0][0] - target < DAY_MS) then = series[0][1];
    return then === undefined || then === 0 ? null : (price / then - 1) * 100;
  };
  return { price, day: change(1), week: change(7), month: change(30), year: change(365) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

// `/coins/<id>/market_chart`: { prices: [[ms, price], ...] }.
export function coinGeckoSeries(answer: unknown): Series {
  const prices = isRecord(answer) ? answer.prices : undefined;
  if (!Array.isArray(prices) || !prices.every((point) => Array.isArray(point)
    && isNumber(point[0]) && isNumber(point[1]))) {
    throw new Error('CoinGecko answered with no prices');
  }
  return prices.map((point) => [point[0], point[1]] as const);
}

// Wallex's `/udf/history`: { s: 'ok', t: [seconds, ...], c: ['close', ...] } — closes are strings.
export function wallexSeries(answer: unknown): Series {
  const times = isRecord(answer) ? answer.t : undefined;
  const closes = isRecord(answer) ? answer.c : undefined;
  if (!Array.isArray(times) || !Array.isArray(closes) || times.length !== closes.length) {
    throw new Error('Wallex answered with no prices');
  }
  return times.map((time, index) => {
    const close = Number(closes[index]);
    if (!isNumber(time) || !Number.isFinite(close)) throw new Error('Wallex answered with a price that is not a number');
    return [time * 1000, close] as const;
  });
}

// Open-Meteo's geocoding search answers with no `results` at all when nothing matches.
export function placeOf(name: string, answer: unknown): Place {
  const first: unknown = isRecord(answer) && Array.isArray(answer.results) ? answer.results[0] : undefined;
  if (!isRecord(first) || !isNumber(first.latitude) || !isNumber(first.longitude)) {
    throw new Error(`No place called "${name}"`);
  }
  return { name: typeof first.name === 'string' ? first.name : name, latitude: first.latitude, longitude: first.longitude };
}

// Open-Meteo's daily forecast, asked for one day, so every list holds today alone.
export function forecastOf(place: string, answer: unknown): Forecast {
  const daily = isRecord(answer) && isRecord(answer.daily) ? answer.daily : {};
  const today = (name: string): unknown => (Array.isArray(daily[name]) ? daily[name][0] : undefined);
  const code = today('weather_code');
  const low = today('temperature_2m_min');
  const high = today('temperature_2m_max');
  const rain = today('precipitation_probability_max');
  if (!isNumber(code) || !isNumber(low) || !isNumber(high)) throw new Error('Open-Meteo answered with no forecast');
  return { place, condition: weatherWord(code), low, high, rain: isNumber(rain) ? rain : null };
}

// The WMO weather codes Open-Meteo uses, by family. The intensities inside a family are left out: the
// card has room for one word.
const WEATHER_WORDS: readonly [readonly number[], string][] = [
  [[0], 'Clear'], [[1], 'Mostly clear'], [[2], 'Partly cloudy'], [[3], 'Overcast'], [[45, 48], 'Fog'],
  [[51, 53, 55, 56, 57], 'Drizzle'], [[61, 63, 65, 66, 67], 'Rain'], [[71, 73, 75, 77], 'Snow'],
  [[80, 81, 82], 'Showers'], [[85, 86], 'Snow showers'], [[95, 96, 99], 'Thunderstorm'],
];

export function weatherWord(code: number): string {
  return WEATHER_WORDS.find(([codes]) => codes.includes(code))?.[1] ?? 'Unknown';
}

// A failed read keeps the numbers from the last good one on screen, with the reason underneath: half an
// hour old is still worth reading, and a blank card says less than a stale one.
export function settle<T>(previous: T | null, reading: Reading<T>): { value: T | null; message: string } {
  return reading.ok ? { value: reading.value, message: '' } : { value: previous, message: reading.message };
}

export function formatChange(change: number | null): string {
  if (change === null) return '—';
  return `${change < 0 ? '−' : '+'}${Math.abs(change).toFixed(1)}%`;
}
