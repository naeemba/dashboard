import type { BrowserBounds } from '../../shared/browser/browser';

// Where the browser's web page is drawn, if anywhere. The page is a native view on top of the whole
// window: no HTML can be drawn over it, so a dialog opened while it shows would open under the page,
// unseen, holding the keyboard. So the page goes away while anything floats over the app.
//
// What floats is decided once, here, by where it lives rather than by a list of dialogs to keep in
// step: everything the app draws in place is inside one of its three regions, the title row, the pages
// and the status bar (index.html), and everything that floats over them is a child of the body beside
// them — openOverlay's sheets (help, the pickers, confirm, prompt, settings), the which-key strip, the
// file hints. A new floating thing appended to the body hides the page without a line here; one drawn
// inside a page would not, which is why browser-rule-1 puts every floating layer on the body.
const APP_REGIONS = new Set(['title', 'pages', 'status']);

// A child of the body: its id, and whether it is drawn at all (a hidden which-key strip, a script, is not).
export type BodyLayer = { id: string; drawn: boolean };

export function floatsOverApp(layers: readonly BodyLayer[]): boolean {
  return layers.some((layer) => layer.drawn && !APP_REGIONS.has(layer.id));
}

// One project's browser screen: whether it is on screen (its page in front, browser its mode) and the
// box its web page fills.
export type BrowserSpot = { projectPath: string; onScreen: boolean; bounds: BrowserBounds };

export function browserPlacement(
  spots: readonly BrowserSpot[], layers: readonly BodyLayer[],
): { projectPath: string; bounds: BrowserBounds } | null {
  if (floatsOverApp(layers)) return null;
  const spot = spots.find((each) => each.onScreen && each.bounds.width > 0 && each.bounds.height > 0);
  return spot === undefined ? null : { projectPath: spot.projectPath, bounds: spot.bounds };
}
