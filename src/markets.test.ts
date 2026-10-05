import { describe, expect, it } from 'vitest';
import {
  coinGeckoSeries, forecastOf, formatChange, placeOf, quoteOf, settle, wallexSeries, weatherWord,
  type Series,
} from './markets';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 5, 12);

// One point a day at midnight for `days` days, then one at noon today: the shape CoinGecko answers in.
function daily(days: number, price: (daysAgo: number) => number): Series {
  const midnight = Date.UTC(2026, 9, 5);
  const points: [number, number][] = [];
  for (let ago = days; ago >= 1; ago -= 1) points.push([midnight - ago * DAY, price(ago)]);
  points.push([NOW, price(0)]);
  return points;
}

describe('quoteOf', () => {
  it('compares the latest price with the one a day, a week, a month and a year before', () => {
    const quote = quoteOf(daily(400, (ago) => (ago === 0 ? 200 : ago <= 1 ? 100 : ago <= 7 ? 160 : 400)));
    expect(quote.price).toBe(200);
    expect(quote.day).toBeCloseTo(100);
    expect(quote.week).toBeCloseTo(25);
    expect(quote.month).toBeCloseTo(-50);
    expect(quote.year).toBeCloseTo(-50);
  });

  it('reads a year from the oldest point when the series is less than a day short of one', () => {
    // CoinGecko's "365 days" starts at midnight 364 days back, so nothing is as old as a year to the hour.
    const series = daily(364, (ago) => (ago === 364 ? 50 : 100));
    expect(quoteOf(series).year).toBeCloseTo(100);
  });

  it('has no change for a span the series does not reach', () => {
    const quote = quoteOf(daily(10, () => 100));
    expect(quote.week).toBe(0);
    expect(quote.month).toBeNull();
    expect(quote.year).toBeNull();
  });

  it('has no change from a price of nothing, rather than an infinite one', () => {
    expect(quoteOf(daily(2, (ago) => (ago === 0 ? 5 : 0))).day).toBeNull();
  });

  it('refuses an empty series', () => {
    expect(() => quoteOf([])).toThrow('No prices');
  });
});

describe('coinGeckoSeries', () => {
  it('reads the prices list', () => {
    expect(coinGeckoSeries({ prices: [[1, 2], [3, 4]] })).toEqual([[1, 2], [3, 4]]);
  });

  it('refuses anything else', () => {
    expect(() => coinGeckoSeries({ status: { error_message: 'rate limited' } })).toThrow();
    expect(() => coinGeckoSeries({ prices: [['a', 2]] })).toThrow();
  });
});

describe('wallexSeries', () => {
  it('pairs each candle\'s time in seconds with its close', () => {
    expect(wallexSeries({ s: 'ok', t: [10, 20], c: ['100', '101.5'] })).toEqual([[10_000, 100], [20_000, 101.5]]);
  });

  it('refuses an answer with no candles in it', () => {
    expect(() => wallexSeries({ s: 'no_data' })).toThrow('no prices');
    expect(() => wallexSeries({ s: 'ok', t: [1], c: ['x'] })).toThrow();
  });
});

describe('placeOf', () => {
  it('takes the first match', () => {
    expect(placeOf('Tehran', { results: [{ name: 'Tehran', latitude: 35.7, longitude: 51.4 }] }))
      .toEqual({ name: 'Tehran', latitude: 35.7, longitude: 51.4 });
  });

  it('names the place it could not find', () => {
    expect(() => placeOf('Tehrn', { generationtime_ms: 1 })).toThrow('No place called "Tehrn"');
  });
});

describe('forecastOf', () => {
  it('reads today\'s condition, low, high and chance of rain', () => {
    const answer = {
      daily: {
        weather_code: [61], temperature_2m_min: [14.2], temperature_2m_max: [25.7],
        precipitation_probability_max: [40],
      },
    };
    expect(forecastOf('Tehran', answer)).toEqual({
      place: 'Tehran', condition: 'Rain', low: 14.2, high: 25.7, rain: 40,
    });
  });

  it('refuses an answer with no day in it', () => {
    expect(() => forecastOf('Tehran', { daily: {} })).toThrow();
  });
});

describe('weatherWord', () => {
  it('names the code\'s family', () => {
    expect(weatherWord(0)).toBe('Clear');
    expect(weatherWord(2)).toBe('Partly cloudy');
    expect(weatherWord(63)).toBe('Rain');
    expect(weatherWord(95)).toBe('Thunderstorm');
    expect(weatherWord(1234)).toBe('Unknown');
  });
});

describe('settle', () => {
  it('takes a good reading', () => {
    expect(settle(1, { ok: true, value: 2 })).toEqual({ value: 2, message: '' });
  });

  it('keeps the last good value through a failure and says why', () => {
    expect(settle(1, { ok: false, message: 'timed out' })).toEqual({ value: 1, message: 'timed out' });
    expect(settle(null, { ok: false, message: 'timed out' })).toEqual({ value: null, message: 'timed out' });
  });
});

describe('formatChange', () => {
  it('signs and rounds a change, and dashes a missing one', () => {
    expect(formatChange(1.234)).toBe('+1.2%');
    expect(formatChange(-0.06)).toBe('−0.1%');
    expect(formatChange(null)).toBe('—');
  });
});
