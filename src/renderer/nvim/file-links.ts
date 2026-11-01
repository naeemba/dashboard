// File paths in a pane's output, the way an agent or a compiler prints them: `src/main.ts`,
// `src/main.ts:42`, `./notes.md:3:7`, `~/.zshrc`, `/etc/hosts`. Both ways of opening one read this —
// the click, through the link provider page.ts registers, and the hint key, which labels every one on
// screen — so a path the click underlines is a path the hint key labels, and the other way round.
//
// Nothing here knows whether the file exists. That is main's to answer, against the pane's own folder,
// when you actually open one; file-open.ts holds that half.

import type { LinkSpan, FileLink } from '../../shared/panes/links';

// A path is segments joined by slashes, with an optional `~/`, `./`, `../` or `/` in front. A dot only
// sits between word characters, so the full stop that ends a sentence is not part of the path. A
// leading dot is allowed for `.env` and `.dashboard/board.json`.
const SEGMENT = String.raw`\.?[\w@+-]+(?:\.[\w@+-]+)*`;
const PATH = String.raw`(?:~\/|\.{1,2}\/|\/)?${SEGMENT}(?:\/${SEGMENT})*`;
// Only at the start of the line or after something that cannot be part of a path, so the tail of
// `foo=bar/baz` is still found but the middle of a word is not.
const FILE_LINK = new RegExp(String.raw`(?<=^|[\s'"\`(\[<{=,])(${PATH})(?::(\d+)(?::(\d+))?)?`, 'g');
const URL_PATTERN = /\b[a-z][\w+.-]*:\/\/\S+/gi;
// The last segment has a letter after its final dot: `main.ts`, not the `1.5` of a version number.
const EXTENSION = /\.[A-Za-z]\w*$/;

// One line of text; wrapped-links.ts joins a row to the one it carries on to before asking.
export function fileLinksIn(text: string): FileLink[] {
  // A URL is webLinksIn's. Its path part looks exactly like a file path, and without this the
  // `/docs/intro` of `https://example.com/docs/intro` would underline twice.
  const urls = [...text.matchAll(URL_PATTERN)].map((match) => [match.index, match.index + match[0].length]);
  const links: FileLink[] = [];
  for (const match of text.matchAll(FILE_LINK)) {
    const start = match.index;
    const end = start + match[0].length;
    if (urls.some(([urlStart, urlEnd]) => start < urlEnd && end > urlStart)) continue;
    const filePath = match[1];
    // A bare word with no slash and no extension is a word, not a file. `and/or` and `e.g` still get
    // through; main finds no such file and says so.
    if (!filePath.includes('/') && !EXTENSION.test(filePath)) continue;
    const link: FileLink = { start, end, path: filePath };
    if (match[2] !== undefined) link.line = Number(match[2]);
    if (match[3] !== undefined) link.column = Number(match[3]);
    links.push(link);
  }
  return links;
}

// The web addresses a click opens in the browser: the pattern xterm's web links addon used, which
// leaves out the full stop or bracket a sentence puts after an address.
const WEB_LINK = /https?:\/\/[^\s"'!*(){}|\\^<>`]*[^\s"':,.!?{}|\\^~[\]`()<>]/gi;

export function webLinksIn(text: string): LinkSpan[] {
  return [...text.matchAll(WEB_LINK)].map((match) => ({ start: match.index, end: match.index + match[0].length }));
}

// The letters the hint key puts over the paths on screen, home row first. One letter each, so a path is
// one keystroke away and no label is the start of another.
const HINT_LETTERS = 'asdfghjklqwertyuiopzxcvbnm';

// ponytail: 26 paths at most, labelled from the bottom of the screen up, since the newest output is
// what you usually want. Two-letter labels are the upgrade if a screen ever holds more.
export function hintLabels(count: number): string[] {
  return [...HINT_LETTERS.slice(0, count)];
}
