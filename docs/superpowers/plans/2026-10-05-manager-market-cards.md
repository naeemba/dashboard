# Manager Market Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A row of four read-only cards across the top of the manager page: the date with today's weather, BTC/USD, USDT/toman, and gold/USD.

**Architecture:** Main fetches four public JSON APIs and answers one snapshot over `markets:read`. Each card in the snapshot is either a value or a failure message. Pure parsing and arithmetic live in `markets.ts` with tests. The renderer view asks on start and every 30 minutes, keeps each card's last good value, and draws.

**Tech Stack:** Electron 44, TypeScript, Vite, Vitest. Node's global `fetch` in main. `Intl.DateTimeFormat` for both calendars. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-05-manager-market-cards-design.md`

## Global Constraints

- No new dependencies.
- No abbreviated identifiers (`button`, not `btn`). `id`, `url`, `json` and `api` are fine.
- 600 code lines per file at most. `main.ts` is at 590, so it gets one import and one handler. `index.css` is over the limit and is not touched.
- Every new `<input>`/`<textarea>` gets `dir = 'auto'`. This plan adds none, because the settings row reuses the existing editor.
- Any error shown to a person goes through `failureText`, never `String(error)`.
- IPC channel names are `<noun>:<verb>`: `markets:read`.
- Help (`src/help.ts`) must describe the row in the same change.
- Version bump: `1.8.0` → `1.9.0`.
- Never quit, restart or reinstall the running Dashboard app.

## Review Focus

1. One source down or slow (time-out after 15 s): the other three cards still draw, and the failed one keeps its last numbers and says why. Covered by `settle` tests in Task 1.
2. A place the geocoder does not know (`Tehrn`): the weather card says `No place called "Tehrn"`, and the date still shows. Covered by a `placeOf` test in Task 1.
3. A series shorter than the span (CoinGecko's 365 days starts one day short of a year): `year` still resolves from the oldest point when it is within a day of the span, and is `null` (drawn `—`) beyond that. It is never `NaN`. Covered by `quoteOf` tests in Task 1.
4. A previous price of 0: the change is `null`, not `Infinity`. Covered by a `quoteOf` test in Task 1.
5. Wallex answering `{"s":"no_data"}`, or any body of the wrong shape: a message, not a crash. Covered by a `wallexSeries` test in Task 1.

---

### Task 1: Pure market and weather logic

**Files:**
- Create: `src/markets.ts`
- Test: `src/markets.test.ts`

**Interfaces:**
- Produces:
  - `type Series = readonly (readonly [number, number])[]`, holding `[epoch ms, price]` pairs, oldest first
  - `type Quote = { price: number; day: number | null; week: number | null; month: number | null; year: number | null }`, with percentages
  - `type Place = { name: string; latitude: number; longitude: number }`
  - `type Forecast = { place: string; condition: string; low: number; high: number; rain: number | null }`
  - `type Reading<T> = { ok: true; value: T } | { ok: false; message: string }`
  - `type MarketsSnapshot = { weather: Reading<Forecast>; btc: Reading<Quote>; usdt: Reading<Quote>; gold: Reading<Quote> }`
  - `quoteOf(series: Series): Quote`
  - `coinGeckoSeries(answer: unknown): Series`
  - `wallexSeries(answer: unknown): Series`
  - `placeOf(name: string, answer: unknown): Place`
  - `forecastOf(place: string, answer: unknown): Forecast`
  - `weatherWord(code: number): string`
  - `settle<T>(previous: T | null, reading: Reading<T>): { value: T | null; message: string }`
  - `formatChange(change: number | null): string`

- [ ] **Step 1: Write the failing tests** in `src/markets.test.ts`. They cover:
  - `quoteOf`: changes over a day, a week, a month and a year
  - the oldest-point fallback within one day
  - `null` beyond that
  - `null` when the earlier price is 0
  - throwing on an empty series
  - `coinGeckoSeries`, `wallexSeries` and `placeOf`: good answers and bad ones
  - `forecastOf`
  - `weatherWord` for 0, 2, 63 and 95
  - `settle` keeping the last good value
  - `formatChange` for a gain, a loss and `null`
- [ ] **Step 2:** Run `npx vitest run src/markets.test.ts`. Expect it to fail: the module is not there.
- [ ] **Step 3:** Implement `src/markets.ts`. Code is in the commit. Each change compares the latest price with the last point at or before `latest − days`. If no point is that old, it falls back to the oldest point when that point is less than a day short.
- [ ] **Step 4:** Run the test. Expect a pass.
- [ ] **Step 5:** Commit.

### Task 2: Weather place setting

**Files:**
- Modify: `src/settings.ts` (the `Settings` type, `defaultSettings`, `parseSettings`, and a new `DEFAULT_WEATHER_PLACE`)
- Modify: `src/settings-rows.ts` (row kind `weather-place` under a `Weather` heading)
- Modify: `src/settings-view.ts` (`finish` gets a branch where blank becomes `DEFAULT_WEATHER_PLACE`)
- Test: `src/settings.test.ts`, `src/settings-rows.test.ts`

**Interfaces:**
- Produces: `Settings.weatherPlace: string`, which is never blank after parsing. Also `DEFAULT_WEATHER_PLACE = 'Tehran'`.

- [ ] **Step 1: Write the failing tests.**
  - `parseSettings({})` gives `weatherPlace` `'Tehran'`.
  - `{ weatherPlace: '  ' }` and `{ weatherPlace: 4 }` both give `'Tehran'`.
  - `{ weatherPlace: 'Shiraz' }` keeps `'Shiraz'`.
  - The rows include a `weather-place` row.
- [ ] **Step 2:** Run the tests. Expect them to fail.
- [ ] **Step 3:** Implement. `withoutShipped` needs no change: it walks every field generically.
- [ ] **Step 4:** Run `npm test` and `npx tsc --noEmit`. Expect both to pass.
- [ ] **Step 5:** Commit.

### Task 3: Fetching in main and the IPC channel

**Files:**
- Create: `src/markets-fetch.ts` (wiring, exempt from the test rule). It holds `readMarkets(place: string): Promise<MarketsSnapshot>`.
- Modify: `src/main.ts` (one import, plus `ipcMain.handle('markets:read', () => readMarkets(settings.weatherPlace))`)
- Modify: `src/bridge.ts` (`readMarkets(): Promise<MarketsSnapshot>`)
- Modify: `src/preload.ts` (`readMarkets: () => ipcRenderer.invoke('markets:read')`)
- Modify: any test fake typed as `DashboardBridge` that `tsc` flags

**Interfaces:**
- Consumes: Task 1's parsers, `quoteOf` and `Reading`. Task 2's `weatherPlace`.
- Produces: `bridge.readMarkets()`.

- [ ] **Step 1:** Write `markets-fetch.ts`. Every read is wrapped so it settles to a `Reading`, with its message from `failureText`. Each fetch has a 15 s `AbortSignal.timeout`. A non-2xx answer throws `<host> answered <status>`.
- [ ] **Step 2:** Wire main, the bridge and preload.
- [ ] **Step 3:** Run `npx tsc --noEmit` and `npm test`. Expect both to pass.
- [ ] **Step 4:** Smoke-test the real endpoints with a throwaway script in the scratchpad that calls the same parsers.
- [ ] **Step 5:** Commit.

### Task 4: The row on the manager page, help and version

**Files:**
- Create: `src/markets-view.ts`. `createMarketsView(bridge): HTMLElement` asks now and every 30 minutes.
- Create: `src/markets.css`, imported from `markets-view.ts`. It moves `.page.page-manager .section-strip` and `.page.page-manager .view` down by `--markets-height`.
- Modify: `src/manager-page.ts` (append the row before the strip)
- Modify: `src/help.ts` (the manager blurb names the row; the settings blurb names the place, if it lists settings)
- Modify: `package.json` (`1.9.0`)

- [ ] **Step 1:** Implement the view.
  - Weather card: the Persian date (`fa-IR-u-ca-persian`) as its title, then the Gregorian date (`en-GB`), then the condition with the place, then the low and high with the chance of rain.
  - Each quote card: its title, the price, `1d ±x%  1w ±x%`, then `1m ±x%  1y ±x%`, with each change coloured up or down.
  - A note line under each card carries the failure message.
- [ ] **Step 2:** Edit the help blurb and bump the version.
- [ ] **Step 3:** Run `npm test`, `npx tsc --noEmit`, `npx eslint .`, and the two `dir="auto"` greps. Also run the `String(error)` grep.
- [ ] **Step 4:** Commit. The installed app needs a rebuild and a restart to show it. Do not do either.
