import type { Refused } from '../../../shared/app/bridge';
import type { BrowserBounds, BrowserState, BrowserStep } from '../../../shared/browser/browser';
import { isFilledText } from '../pane/pane-input';

// What the browser actions do to the views, handed to them by browser-views.ts, the one module that
// holds a WebContentsView. Nothing here decides anything: every rule is in the actions and in
// browser-tabs.ts, so each action is tested against a fake of these (browser-fixture.ts).
export type BrowserPorts = {
  browserOf(projectPath: string): BrowserState;
  // The project's tabs as they now are: kept, sent to the window, and the view on screen put right.
  keep(projectPath: string, state: BrowserState): void;
  // A new tab's view, loading `url`; answers the tab's id.
  makeView(projectPath: string, url: string): number;
  dropView(id: number): void;
  load(id: number, url: string): void;
  step(id: number, step: BrowserStep): void;
  // The project whose tab on screen is drawn, and where; null draws none.
  place(placed: { projectPath: string; bounds: BrowserBounds } | null): void;
  focus(id: number): void;
};

export function projectInput(raw: Record<string, unknown>): { projectPath: string } | Refused {
  return isFilledText(raw.projectPath) ? { projectPath: raw.projectPath } : { refused: 'no project folder was given' };
}
