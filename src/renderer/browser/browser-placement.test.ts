import { describe, expect, it } from 'vitest';
import { browserPlacement, floatsOverApp, type BodyLayer, type BrowserSpot } from './browser-placement';

const app: BodyLayer[] = [{ id: 'title', drawn: true }, { id: 'pages', drawn: true }, { id: 'status', drawn: true }, { id: '', drawn: false }];
const bounds = { x: 0, y: 64, width: 1200, height: 700 };
const spots: BrowserSpot[] = [
  { projectPath: '/work/web', onScreen: false, bounds },
  { projectPath: '/work/api', onScreen: true, bounds },
];

describe('floatsOverApp', () => {
  it('is the app alone: its three regions, and a script or a hidden strip beside them', () => {
    expect(floatsOverApp(app)).toBe(false);
    expect(floatsOverApp([...app, { id: '', drawn: false }])).toBe(false);
  });

  it('is anything else drawn on the body, whoever put it there', () => {
    expect(floatsOverApp([...app, { id: '', drawn: true }])).toBe(true);
  });
});

describe('browserPlacement', () => {
  it('draws the page of the project on screen, in its box', () => {
    expect(browserPlacement(spots, app)).toEqual({ projectPath: '/work/api', bounds });
  });

  it('draws nothing while a dialog, the which-key strip or the file hints float over the app', () => {
    expect(browserPlacement(spots, [...app, { id: '', drawn: true }])).toBeNull();
  });

  it('draws nothing with no browser on screen, or a box with no room', () => {
    expect(browserPlacement([{ ...spots[1], onScreen: false }], app)).toBeNull();
    expect(browserPlacement([{ ...spots[1], bounds: { ...bounds, width: 0 } }], app)).toBeNull();
  });
});
