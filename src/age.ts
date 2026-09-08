// How long ago a timestamp was, in words: "3 days ago", "yesterday", "just now". Intl does the
// wording, the plural and the language, so this only picks the unit and the sign.
//
// Months are 30 days and years are 365. Nothing here is a calendar calculation: the answer is read at
// a glance to tell this morning's card from last March's, and being a day out in November costs
// nothing.
const UNITS: readonly (readonly [Intl.RelativeTimeFormatUnit, number])[] = [
  ['year', 365 * 24 * 60 * 60 * 1000],
  ['month', 30 * 24 * 60 * 60 * 1000],
  ['day', 24 * 60 * 60 * 1000],
  ['hour', 60 * 60 * 1000],
  ['minute', 60 * 1000],
];

// null when the text is not a date. A card's timestamps are whatever was in the file, and
// .dashboard/CLAUDE.md invites hand-editing, so `"createdAt": "last tuesday"` has to say nothing
// rather than draw "Invalid Date" on the card.
// Built once. Constructing one of these negotiates the locale, which is far dearer than formatting
// with it, and the board redraws every card on every keystroke.
const FORMAT = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

export function relativeAge(iso: string, now: number = Date.now()): string | null {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  const elapsed = now - then;
  for (const [unit, size] of UNITS) {
    // Truncated, not rounded: at 1.9 days the card was edited yesterday, and rounding would say two
    // days ago about a day that has not finished happening.
    if (Math.abs(elapsed) >= size) return FORMAT.format(-Math.trunc(elapsed / size), unit);
  }
  return 'just now';
}
