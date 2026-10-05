import '@fontsource/vazirmatn/arabic-400.css';
import '@fontsource/vazirmatn/arabic-500.css';
import './markets.css';
import type { DashboardBridge } from './bridge';
import { icon, type IconName } from './icons';
import { formatChange, settle, type Forecast, type Quote, type Reading, type WeatherWord } from './markets';

// The row of four cards across the top of the manager page. Read-only: nothing here takes a key or a
// click, so there is nothing for the keyboard to reach. What the numbers mean is markets.ts's.

// Often enough for a price you glance at, rare enough to stay far inside every source's free limit.
const REFRESH_MS = 30 * 60_000;

const PERSIAN_DATE = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const GREGORIAN_WEEKDAY = new Intl.DateTimeFormat('en-GB', { weekday: 'long' });
const GREGORIAN_DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const PRICE = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

// markets.ts's weather words, each with the icon drawn beside the temperature. Keyed by WeatherWord, so
// a word added there and not here fails to compile.
const WEATHER_ICONS: Record<WeatherWord, IconName> = {
  Clear: 'sun', 'Mostly clear': 'sun', 'Partly cloudy': 'cloudSun', Overcast: 'cloud', Fog: 'fog',
  Drizzle: 'drizzle', Rain: 'rain', Showers: 'rain', Snow: 'snow', 'Snow showers': 'snow', Thunderstorm: 'storm', Unknown: 'cloud',
};

// The Persian date the way it is written in Persian: the weekday, then day, month, year — "سه‌شنبه
// ۱۴ مهر ۱۴۰۵". ICU's fa-IR pattern runs the other way round, year first and the weekday last behind
// a comma, so the parts are put back in order here.
function persianDate(now: Date): { weekday: string; date: string } {
  const parts = Object.fromEntries(PERSIAN_DATE.formatToParts(now).map((piece) => [piece.type, piece.value]));
  return { weekday: parts.weekday, date: `${parts.day} ${parts.month} ${parts.year}` };
}

// One card's elements, and its last good answer, kept on screen through a failed read.
type Card<T> = { title: HTMLElement; subtitle: HTMLElement; body: HTMLElement; note: HTMLElement; last: T | null };

function part(className: string, ...children: (string | HTMLElement)[]): HTMLElement {
  const element = document.createElement('div');
  element.className = className;
  element.append(...children);
  return element;
}

// One change: its span over it, coloured by which way it went.
function stat(label: string, value: number | null): HTMLElement {
  const figure = part('markets-stat-value', formatChange(value));
  if (value !== null && value !== 0) figure.classList.add(value > 0 ? 'markets-up' : 'markets-down');
  return part('markets-stat', part('markets-stat-label', label), figure);
}

function quoteParts(unit: string, quote: Quote | null): HTMLElement[] {
  if (quote === null) return [part('markets-figure', '—')];
  return [
    part('markets-figure', PRICE.format(quote.price), part('markets-unit', unit)),
    part('markets-stats', stat('24h', quote.day), stat('1w', quote.week), stat('1m', quote.month), stat('1y', quote.year)),
  ];
}

function forecastParts(forecast: Forecast | null): HTMLElement[] {
  if (forecast === null) return [];
  const sky = part('markets-sky', icon(WEATHER_ICONS[forecast.condition]));
  const figure = part('markets-figure', sky, `${Math.round(forecast.low)}° – ${Math.round(forecast.high)}°C`);
  const facts = part('markets-chips', part('markets-chip', `${forecast.condition} in ${forecast.place}`));
  if (forecast.rain !== null) facts.append(part('markets-chip', icon('droplet'), `${forecast.rain}%`));
  return [figure, facts];
}

export function createMarketsView(bridge: DashboardBridge): HTMLElement {
  const element = document.createElement('div');
  element.className = 'markets';

  // The accent names a theme colour, so a card's badge follows whatever palette settings hold.
  // aside: drawn at the far end of the head, the date card's Persian half.
  function card<T>(glyph: IconName, accent: string, title: string, subtitle: string, aside?: HTMLElement): Card<T> {
    const badge = part('markets-badge', icon(glyph));
    const parts = {
      title: part('markets-title', title), subtitle: part('markets-subtitle', subtitle),
      body: part('markets-body'), note: part('markets-note'), last: null,
    };
    const head = part('markets-head', badge, part('markets-heading', parts.title, parts.subtitle));
    if (aside) head.append(aside);
    const box = part('markets-card', head, parts.body, parts.note);
    box.style.setProperty('--accent', `var(--${accent})`);
    element.append(box);
    return parts;
  }

  function draw<T>(target: Card<T>, reading: Reading<T>, parts: (value: T | null) => HTMLElement[]): void {
    const { value, message } = settle(target.last, reading);
    target.last = value;
    target.body.replaceChildren(...parts(value));
    target.note.textContent = message;
  }

  const persianWeekday = part('markets-title');
  const persianDay = part('markets-subtitle');
  const persian = part('markets-persian', persianWeekday, persianDay);
  persian.dir = 'rtl';
  const date = card<Forecast>('calendar', 'blue', '', '', persian);
  const quotes = [
    { card: card<Quote>('bitcoin', 'yellow', 'Bitcoin', 'BTC · USD'), unit: 'USD' },
    { card: card<Quote>('dollar', 'green', 'Tether', 'USDT · Toman'), unit: 'Toman' },
    { card: card<Quote>('coins', 'brightYellow', 'Gold', 'PAXG · USD per oz'), unit: 'USD' },
  ];

  function drawDate(reading: Reading<Forecast>): void {
    const now = new Date();
    const { weekday, date: day } = persianDate(now);
    date.title.textContent = GREGORIAN_WEEKDAY.format(now);
    date.subtitle.textContent = GREGORIAN_DATE.format(now);
    persianWeekday.textContent = weekday;
    persianDay.textContent = day;
    draw(date, reading, forecastParts);
  }

  function refresh(): void {
    void bridge.readMarkets().then((snapshot) => {
      drawDate(snapshot.weather);
      [snapshot.btc, snapshot.usdt, snapshot.gold].forEach((reading, index) =>
        draw(quotes[index].card, reading, (quote) => quoteParts(quotes[index].unit, quote)));
    });
  }

  // The dates are there before the first answer, which can take a few seconds: a failed reading with
  // nothing to say draws them alone.
  drawDate({ ok: false, message: '' });
  refresh();
  setInterval(refresh, REFRESH_MS);
  return element;
}
