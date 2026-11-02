import { describe, expect, it } from 'vitest';
import type { Stroke } from './ink-geometry';
import { INK_COLORS, INK_WIDTHS, parseInk, serializeInk } from './ink-svg';

const line: Stroke = {
  color: '#e5534b',
  width: 4,
  points: [{ x: 10.04, y: 20.26, pressure: 0.5 }, { x: 30, y: 40.5, pressure: 0.734 }],
};
const dot: Stroke = { color: 'currentColor', width: 2, points: [{ x: 5, y: 5, pressure: 0.5 }] };

describe('serializeInk', () => {
  it('is an empty file for a page with nothing on it', () => {
    expect(serializeInk([])).toBe('');
  });

  it('is a standalone SVG sized to the ink plus a margin', () => {
    const text = serializeInk([line]);
    expect(text).toContain('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 46 57" width="46" height="57">');
    expect(text.trim().endsWith('</svg>')).toBe(true);
  });

  it('draws each stroke as a filled path and keeps the raw data beside it, rounded', () => {
    const text = serializeInk([line]);
    expect(text).toContain('fill="#e5534b"');
    expect(text).toContain('data-color="#e5534b" data-width="4" data-points="10,20.3,0.5 30,40.5,0.73"');
  });

  it('is the same bytes for the same strokes', () => {
    expect(serializeInk([line, dot])).toBe(serializeInk([line, dot]));
  });

  it('leaves out a stroke with no points', () => {
    expect(serializeInk([{ ...dot, points: [] }])).toBe('');
  });

  it('sizes a page with more points than one call takes arguments', () => {
    const points = Array.from({ length: 200_000 }, (_unused, index) => ({ x: index % 500, y: index / 1000, pressure: 0.5 }));
    expect(serializeInk([{ ...dot, points }])).toContain('viewBox="0 0 515 216"');
  });
});

describe('parseInk', () => {
  it('reads an empty or blank file as an empty page', () => {
    expect(parseInk('')).toEqual([]);
    expect(parseInk(' \n\t')).toEqual([]);
  });

  it('gives back what serializeInk wrote, after rounding', () => {
    const back = parseInk(serializeInk([line, dot]));
    expect(back).toEqual([
      { color: '#e5534b', width: 4, points: [{ x: 10, y: 20.3, pressure: 0.5 }, { x: 30, y: 40.5, pressure: 0.73 }] },
      dot,
    ]);
  });

  it('is stable: writing what was read changes nothing', () => {
    const once = serializeInk([line, dot]);
    expect(serializeInk(parseInk(once)!)).toBe(once);
  });

  it('round-trips every colour and width the page offers', () => {
    const strokes = INK_COLORS.flatMap((color) => INK_WIDTHS.map((width): Stroke => ({ color, width, points: dot.points })));
    expect(parseInk(serializeInk(strokes))).toEqual(strokes);
  });

  it('refuses a file that is not ours, so it is never written over', () => {
    expect(parseInk('hello')).toBeUndefined();
    expect(parseInk('<svg xmlns="http://www.w3.org/2000/svg"><circle r="3"/></svg>')).toBeUndefined();
    expect(parseInk('<svg width="1"><path d="M0,0"/></svg>')).toBeUndefined();
  });

  it('refuses malformed data', () => {
    const good = serializeInk([line]);
    expect(parseInk(good.replace('data-points="10,20.3,0.5', 'data-points="10,x,0.5'))).toBeUndefined();
    expect(parseInk(good.replace('data-points="10,20.3,0.5', 'data-points="10,20.3'))).toBeUndefined();
    expect(parseInk(good.replace(/data-points="[^"]*"/, 'data-points=""'))).toBeUndefined();
    expect(parseInk(good.replace('data-width="4"', 'data-width="wide"'))).toBeUndefined();
    expect(parseInk(good.replace('data-color="#e5534b"', 'data-color="red;evil"'))).toBeUndefined();
    expect(parseInk(good.replace(/ data-points="[^"]*"/, ''))).toBeUndefined();
  });
});
