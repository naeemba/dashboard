import { failureText } from '../../shared/errors/failure';
import {
  coinGeckoSeries, forecastOf, placeOf, quoteOf, wallexSeries, type MarketName, type MarketsSnapshot,
  type Place, type Reading,
} from '../../shared/markets/markets';

// Main's half of the manager's four cards: the requests, and nothing about what the answers mean, which
// is markets.ts's. In main rather than the renderer so the page never needs a network policy of its own.

// Long enough for a slow API on a slow line, short enough that a source that never answers does not hold
// the other three back for the whole half hour until the next read.
const TIMEOUT_MS = 15_000;
const DAY_SECONDS = 86_400;

// The last place looked up. It only changes on the settings screen, so every other read skips the
// geocoder's round trip.
let found: { name: string; place: Place } | null = null;

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`${new URL(url).host} answered ${response.status}`);
  return response.json();
}

async function reading<T>(read: () => Promise<T>): Promise<Reading<T>> {
  try {
    return { ok: true, value: await read() };
  } catch (error) {
    return { ok: false, message: failureText(error) };
  }
}

function coinGecko(coin: string): Promise<unknown> {
  return getJson(`https://api.coingecko.com/api/v3/coins/${coin}/market_chart?vs_currency=usd&days=365&interval=daily`);
}

// One card's read, so a card's refresh button costs that card's source alone.
const READS: { [K in keyof MarketsSnapshot]: (placeName: string) => Promise<MarketsSnapshot[K]> } = {
  weather: (placeName) => reading(async () => {
    if (found?.name !== placeName) {
      const name = encodeURIComponent(placeName);
      found = { name: placeName, place: placeOf(placeName, await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${name}&count=1`)) };
    }
    const { place } = found;
    return forecastOf(place.name, await getJson(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}`
      + `&longitude=${place.longitude}&daily=weather_code,temperature_2m_max,temperature_2m_min,`
      + 'precipitation_probability_max&timezone=auto&forecast_days=1'));
  }),
  btc: () => reading(async () => quoteOf(coinGeckoSeries(await coinGecko('bitcoin')))),
  // 400 days rather than 365, so the year card has a candle a full year back to compare with.
  usdt: () => reading(async () => {
    const now = Math.floor(Date.now() / 1000);
    return quoteOf(wallexSeries(await getJson('https://api.wallex.ir/v1/udf/history?symbol=USDTTMN'
      + `&resolution=D&from=${now - 400 * DAY_SECONDS}&to=${now}`), now * 1000));
  }),
  gold: () => reading(async () => quoteOf(coinGeckoSeries(await coinGecko('pax-gold')))),
};

// The name comes over IPC, so it is checked against READS rather than trusted. Only a broken renderer
// sends one that is not there, so it is a failure and throws.
export async function readMarket(market: unknown, placeName: string): Promise<MarketsSnapshot[MarketName]> {
  if (typeof market !== 'string' || !Object.hasOwn(READS, market)) throw new Error(`No market card called "${String(market)}"`);
  return READS[market as MarketName](placeName);
}
