// The two questions the handwriting page asks of a stroke, over plain numbers: what shape is drawn for
// it, and does a point touch it. Both live here and not in the view because each is arithmetic with
// branches (a single point, a repeated point, a pen pressed hard), and a view cannot be tested here.

export type InkPoint = { x: number; y: number; pressure: number };

// What one pen-down-to-pen-up is. `color` is a CSS paint, which is `currentColor` for the theme's own
// text colour; `width` is the nominal width in pixels at a pressure of one half.
export type Stroke = { color: string; width: number; points: InkPoint[] };

// A mouse reports no pressure at all, so the view hands it one half, and one half has to come out as
// the nominal width: 0.4 + 1.2 × 0.5 is exactly 1. A light touch draws at 0.4 and a hard one at 1.6, so
// a pen can write fine and bold lines without picking another width.
export function pressureFactor(pressure: number): number {
  return 0.4 + 1.2 * pressure;
}

function halfWidth(width: number, pressure: number): number {
  return (width / 2) * pressureFactor(pressure);
}

// One decimal is a tenth of a pixel, far below anything a screen can show, and it keeps a path of a
// thousand points from being a file of long fractions.
function round(value: number): number {
  return Math.round(value * 10) / 10;
}

// The filled shape of a stroke, as the `d` of an SVG path: every point pushed out half a width to each
// side along the way the stroke is heading there, down one side and back up the other. A filled
// polygon rather than a stroked polyline because a polyline has one width and the width here follows
// the pressure; it also means the file draws the same in a browser as it does in the app.
//
// A single point has no direction to push along, so it is a dot: a circle of the half width, made of
// two arcs because a path has no circle of its own.
export function strokeOutline(points: readonly InkPoint[], width: number): string {
  if (points.length === 0) return '';
  if (points.length === 1) {
    const { x, y, pressure } = points[0];
    const radius = halfWidth(width, pressure);
    return `M${round(x - radius)},${round(y)}`
      + `a${round(radius)},${round(radius)} 0 1,0 ${round(radius * 2)},0`
      + `a${round(radius)},${round(radius)} 0 1,0 ${round(-radius * 2)},0Z`;
  }
  const left: string[] = [];
  const right: string[] = [];
  // The last direction that was not zero. Two points on the same pixel — a pen resting while the
  // events keep coming — have no direction of their own, and dividing by that zero would put NaN in
  // the file.
  let normalX = 0;
  let normalY = -1;
  points.forEach((point, index) => {
    const before = points[Math.max(0, index - 1)];
    const after = points[Math.min(points.length - 1, index + 1)];
    const dx = after.x - before.x;
    const dy = after.y - before.y;
    const length = Math.hypot(dx, dy);
    if (length > 0) {
      normalX = -dy / length;
      normalY = dx / length;
    }
    const half = halfWidth(width, point.pressure);
    left.push(`${round(point.x + normalX * half)},${round(point.y + normalY * half)}`);
    right.push(`${round(point.x - normalX * half)},${round(point.y - normalY * half)}`);
  });
  return `M${left.join('L')}L${right.reverse().join('L')}Z`;
}

function distanceToSegment(x: number, y: number, from: InkPoint, to: InkPoint): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const squared = dx * dx + dy * dy;
  // A segment whose ends are the same point is that point; the projection below would divide by zero.
  const along = squared === 0 ? 0 : Math.max(0, Math.min(1, ((x - from.x) * dx + (y - from.y) * dy) / squared));
  return Math.hypot(x - (from.x + along * dx), y - (from.y + along * dy));
}

// Whether the eraser at (x, y) touches the stroke: within its own radius of the stroke's ink, which
// reaches half the nominal width from the line through the points. Nominal and not pressure-scaled, so
// a bold stroke is not harder to hit than the line it is drawn along would say.
export function strokeHit(stroke: Stroke, x: number, y: number, radius: number): boolean {
  const reach = radius + stroke.width / 2;
  const { points } = stroke;
  if (points.length === 0) return false;
  if (points.length === 1) return Math.hypot(x - points[0].x, y - points[0].y) <= reach;
  for (let index = 1; index < points.length; index += 1) {
    if (distanceToSegment(x, y, points[index - 1], points[index]) <= reach) return true;
  }
  return false;
}
