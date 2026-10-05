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

// One card's elements, and its last good answer, kept on screen through a failed read.
type Card<T> = { title: HTMLElement; body: HTMLElement; note: HTMLElement; last: T | null };

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

  function card<T>(title: string): Card<T> {
    const box = document.createElement('div');
    box.className = 'markets-card';
    const parts = { title: line(title), body: document.createElement('div'), note: line(), last: null };
    parts.title.classList.add('markets-title');
    parts.note.classList.add('markets-note');
    box.append(parts.title, parts.body, parts.note);
    element.append(box);
    return parts;
  }

  function draw<T>(target: Card<T>, reading: Reading<T>, lines: (value: T | null) => HTMLElement[]): void {
    const { value, message } = settle(target.last, reading);
    target.last = value;
    target.body.replaceChildren(...lines(value));
    target.note.textContent = message;
  }

  const date = card<Forecast>('');
  const quotes = [card<Quote>('BTC / USD'), card<Quote>('USDT / Toman'), card<Quote>('Gold (PAXG) / USD per oz')];
  const quoteOrDash = (quote: Quote | null): HTMLElement[] => (quote === null ? [line('—')] : quoteLines(quote));

  function drawDate(reading: Reading<Forecast>): void {
    const now = new Date();
    date.title.textContent = PERSIAN_DATE.format(now);
    draw(date, reading, (forecast) => [
      line(GREGORIAN_DATE.format(now)), ...(forecast === null ? [] : forecastLines(forecast)),
    ]);
  }

  function refresh(): void {
    void bridge.readMarkets().then((snapshot) => {
      drawDate(snapshot.weather);
      [snapshot.btc, snapshot.usdt, snapshot.gold].forEach((reading, index) => draw(quotes[index], reading, quoteOrDash));
    });
  }

  // The dates are there before the first answer, which can take a few seconds: a failed reading with
  // nothing to say draws them alone.
  drawDate({ ok: false, message: '' });
  refresh();
  setInterval(refresh, REFRESH_MS);
  return element;
}
