import './markets.css';
import type { DashboardBridge } from './bridge';
import { formatChange, settle, type Forecast, type Quote, type Reading } from './markets';

// The row of four cards across the top of the manager page. Read-only: nothing here takes a key or a
// click, so there is nothing for the keyboard to reach. What the numbers mean is markets.ts's.

// Often enough for a price you glance at, rare enough to stay far inside every source's free limit.
const REFRESH_MS = 30 * 60_000;

const DATE_PARTS: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
const PERSIAN_DATE = new Intl.DateTimeFormat('fa-IR-u-ca-persian', DATE_PARTS);
const GREGORIAN_DATE = new Intl.DateTimeFormat('en-GB', DATE_PARTS);
const PRICE = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

type Card = { title: HTMLElement; body: HTMLElement; note: HTMLElement };

function line(...parts: (string | HTMLElement)[]): HTMLElement {
  const element = document.createElement('div');
  element.className = 'markets-line';
  element.append(...parts);
  return element;
}

function change(label: string, value: number | null): HTMLElement {
  const element = document.createElement('span');
  element.className = 'markets-change';
  if (value !== null && value !== 0) element.classList.add(value > 0 ? 'markets-up' : 'markets-down');
  element.textContent = `${label} ${formatChange(value)}`;
  return element;
}

function quoteLines(quote: Quote): HTMLElement[] {
  return [
    line(PRICE.format(quote.price)),
    line(change('1d', quote.day), change('1w', quote.week)),
    line(change('1m', quote.month), change('1y', quote.year)),
  ];
}

function forecastLines(forecast: Forecast): HTMLElement[] {
  const rain = forecast.rain === null ? '' : `, rain ${forecast.rain}%`;
  return [
    line(`${forecast.condition} in ${forecast.place}`),
    line(`${Math.round(forecast.low)}° to ${Math.round(forecast.high)}°C${rain}`),
  ];
}

export function createMarketsView(bridge: DashboardBridge): HTMLElement {
  const element = document.createElement('div');
  element.className = 'markets';

  function card(title: string): Card {
    const box = document.createElement('div');
    box.className = 'markets-card';
    const parts = { title: line(title), body: document.createElement('div'), note: line() };
    parts.title.classList.add('markets-title');
    parts.note.classList.add('markets-note');
    box.append(parts.title, parts.body, parts.note);
    element.append(box);
    return parts;
  }

  const date = card('');
  const btc = card('BTC / USD');
  const usdt = card('USDT / Toman');
  const gold = card('Gold (PAXG) / USD per oz');
  // Each card's last good answer, kept through a failed read.
  let weather: Forecast | null = null;
  const quotes = new Map<Card, Quote>();

  function drawQuote(target: Card, reading: Reading<Quote>): void {
    const { value, message } = settle(quotes.get(target) ?? null, reading);
    if (value !== null) quotes.set(target, value);
    target.body.replaceChildren(...(value === null ? [line('—')] : quoteLines(value)));
    target.note.textContent = message;
  }

  function drawDate(reading: Reading<Forecast> | null): void {
    const now = new Date();
    date.title.textContent = PERSIAN_DATE.format(now);
    const settled = reading === null ? { value: weather, message: '' } : settle(weather, reading);
    weather = settled.value;
    date.body.replaceChildren(line(GREGORIAN_DATE.format(now)), ...(weather === null ? [] : forecastLines(weather)));
    date.note.textContent = settled.message;
  }

  function refresh(): void {
    void bridge.readMarkets().then((snapshot) => {
      drawDate(snapshot.weather);
      drawQuote(btc, snapshot.btc);
      drawQuote(usdt, snapshot.usdt);
      drawQuote(gold, snapshot.gold);
    });
  }

  // The date is there before the first answer, which can take a few seconds.
  drawDate(null);
  refresh();
  setInterval(refresh, REFRESH_MS);
  return element;
}
