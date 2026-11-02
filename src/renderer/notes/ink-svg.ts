import { strokeOutline, type InkPoint, type Stroke } from './ink-geometry';

// What the handwriting page keeps in .dashboard/notes-ink.svg, and the only place that knows its shape.
// Main stores the string without reading it; this is where it is made and where it is understood again.

// The pens. `currentColor` is the theme's own text colour on screen, so a page written in a dark theme
// is not black on black; opened in a browser the same word renders black.
export const INK_COLORS = ['currentColor', '#e5534b', '#4c8dff', '#57ab5a'] as const;
export const INK_WIDTHS = [2, 4, 8] as const;

// Space kept below and to the right of the ink, so a stroke at the edge is not cut by the picture's.
const MARGIN = 16;

const SVG_OPEN = 'xmlns="http://www.w3.org/2000/svg"';

function roundTo(value: number, places: number): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

// The numbers as the file keeps them. Applied before the outline is drawn as well as before the data is
// written, so the picture and the data it came from are made from the same figures.
function rounded(points: readonly InkPoint[]): InkPoint[] {
  return points.map(({ x, y, pressure }) => ({ x: roundTo(x, 1), y: roundTo(y, 1), pressure: roundTo(pressure, 2) }));
}

// A file that draws itself in anything that reads SVG, and that this app can read back exactly.
//
// Each stroke is one filled path, so a browser or a forge shows the page as written. The raw points ride
// along in data-* attributes, because the outline cannot be turned back into the line it came from and
// the page has to stay editable: read it, undo, erase, draw on. Nothing here is random or dated, so the
// same strokes are always the same bytes, and the file diffs line by line — one path to a line.
//
// A page with nothing on it is an empty file rather than an empty picture, so a project that has never
// had handwriting and one whose page was cleared look the same on disk.
export function serializeInk(strokes: readonly Stroke[]): string {
  // A stroke with no points has no shape and no data to read back, so it is not written.
  const drawn = strokes.filter((stroke) => stroke.points.length > 0);
  if (drawn.length === 0) return '';
  const all = drawn.flatMap((stroke) => rounded(stroke.points));
  // reduce, not Math.max(...): a long page holds more points than one call takes arguments.
  const width = Math.ceil(all.reduce((most, point) => Math.max(most, point.x), -Infinity) + MARGIN);
  const height = Math.ceil(all.reduce((most, point) => Math.max(most, point.y), -Infinity) + MARGIN);
  const paths = drawn.map((stroke) => {
    const points = rounded(stroke.points);
    const data = points.map((point) => `${point.x},${point.y},${point.pressure}`).join(' ');
    return `<path fill="${stroke.color}" d="${strokeOutline(points, stroke.width)}"`
      + ` data-color="${stroke.color}" data-width="${stroke.width}" data-points="${data}"/>`;
  });
  return `<svg ${SVG_OPEN} viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">\n`
    + `${paths.join('\n')}\n</svg>\n`;
}

const COLOR = /^(currentColor|#[0-9a-fA-F]{3,8})$/;
const NUMBER = /^-?\d+(\.\d+)?$/;

function parseAttributes(text: string): Map<string, string> {
  const attributes = new Map<string, string>();
  for (const match of text.matchAll(/([a-z-]+)="([^"]*)"/g)) attributes.set(match[1], match[2]);
  return attributes;
}

function parsePoints(text: string): InkPoint[] | undefined {
  if (text === '') return undefined;
  const points: InkPoint[] = [];
  for (const entry of text.split(' ')) {
    const parts = entry.split(',');
    if (parts.length !== 3 || !parts.every((part) => NUMBER.test(part))) return undefined;
    points.push({ x: Number(parts[0]), y: Number(parts[1]), pressure: Number(parts[2]) });
  }
  return points;
}

// The page a file holds, or `undefined` for anything this cannot read: a file somebody else drew, an
// edit that broke a number, a picture with something in it that serializeInk never writes. The
// distinction matters to the caller — an empty file is an empty page, and may be written over; a file
// that cannot be read is somebody's work, and must not be.
//
// Strings and patterns over our own format only, because the renderer's tests have no DOM to parse with
// and a general SVG reader is not the job: anything that is not exactly what serializeInk writes,
// modulo whitespace, is refused.
export function parseInk(text: string): Stroke[] | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return [];
  const outer = /^<svg ([^>]*)>([\s\S]*)<\/svg>$/.exec(trimmed);
  if (!outer || !outer[1].includes(SVG_OPEN)) return undefined;
  const paths = [...outer[2].matchAll(/<path ([^>]*?)\/>/g)];
  // Anything between the paths that is not whitespace is something this page never writes.
  if (outer[2].replace(/<path [^>]*?\/>/g, '').trim() !== '') return undefined;
  const strokes: Stroke[] = [];
  for (const path of paths) {
    const attributes = parseAttributes(path[1]);
    const color = attributes.get('data-color');
    const widthText = attributes.get('data-width');
    const pointsText = attributes.get('data-points');
    if (color === undefined || widthText === undefined || pointsText === undefined) return undefined;
    if (!COLOR.test(color) || !NUMBER.test(widthText) || Number(widthText) <= 0) return undefined;
    const points = parsePoints(pointsText);
    if (points === undefined) return undefined;
    strokes.push({ color, width: Number(widthText), points });
  }
  return strokes;
}
