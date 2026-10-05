# Manager market cards

A row of four read-only cards across the top of the manager page, above the
section strip, on every one of its four sections. Project pages are unchanged.

1. **Date and weather** — today in the Persian calendar and in the Gregorian
   one, then today's forecast for the place named in settings: condition, low
   and high in °C, chance of rain.
2. **BTC / USD**
3. **USDT / toman**
4. **Gold / USD per troy ounce**

Cards 2–4 share one layout: the price now, then the change over a day, a week,
a month and a year, each as a signed percentage, green up and red down.

## Sources

All free, none needs a key. Every one was checked by hand on 2026-10-05.

| Card | Request |
|------|---------|
| BTC | `api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=365&interval=daily` |
| Gold | the same, for `pax-gold` |
| USDT | `api.wallex.ir/v1/udf/history?symbol=USDTTMN&resolution=D&from=<now − 400 days>&to=<now>` |
| Weather | `geocoding-api.open-meteo.com/v1/search?name=<place>&count=1`, then `api.open-meteo.com/v1/forecast?latitude=…&longitude=…&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1` |

Gold is PAX Gold, a token backed one-to-one by a troy ounce, which tracks spot
within about half a percent. True spot needs a keyed API. The card says
`Gold (PAXG)` so nobody reads it as spot.

Nobitex was tried for USDT and dropped: its history endpoint answers
`{"s":"no_data"}` for `USDTIRT` at every resolution. Wallex already prices in
toman, so nothing is divided by ten.

## How it fits

- **`src/markets.ts`** — pure, beside `markets.test.ts`. Turns each source's
  answer into a series of `[time, price]`, and a series into
  `{ price, day, week, month, year }`. Each change compares the latest price
  with the last point at or before that many days earlier, and is `null` when
  the series does not reach back that far. Also maps an Open-Meteo weather
  code to a word.
- **`src/markets-fetch.ts`** — main side, wiring only. Fetches all four in
  parallel, each with a 15-second timeout, and answers one snapshot in which
  each card is `{ ok: true, value }` or `{ ok: false, message }`. The message
  goes through `failureText`.
- **IPC `markets:read`** — one `ipcMain.handle` in `main.ts`, reading the
  weather place from the settings main already holds. `bridge.ts` and
  `preload.ts` get `readMarkets()`.
- **`src/markets-view.ts`** — builds the row, asks once on start and every 30
  minutes after, and redraws. A card whose read failed keeps its last good
  numbers and says why underneath; with no good numbers yet it shows `—` and
  the reason. One card failing never blanks another.
- **`src/manager-page.ts`** — puts the row above the strip.
- **`src/markets.css`** — the row's styles, and moving the strip and the views
  down by the row's height. Its own file because `index.css` is past the size
  limit.
- **Settings** — a new `weatherPlace` string, default `Tehran`; blank also
  means `Tehran`. A `Weather` heading with one text row in the settings
  screen, edited the way the shell row is. The weather card picks a change up
  on its next read.
- **Help** — the manager sections blurb in `src/help.ts` names the row.
- **Version** — minor bump.

The date is drawn with `Intl.DateTimeFormat` — `fa-IR-u-ca-persian` and
`en-GB` — and no library.

## Left out

- Charts and sparklines: numbers only.
- Clicks and keys: the cards are read-only, so there is nothing to reach.
- A clock: the date redraws on the 30-minute read, so just after midnight it can
  show yesterday for up to half an hour.
