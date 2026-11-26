import type { BrowserPlacement, BrowserState, BrowserStep, ViewportSize } from '../../../shared/browser/browser';
import type { Refused } from '../../../shared/app/bridge';
import type { KeyEvent } from '../../browser/page-keys';

// What the browser actions do to the views, handed to them by browser-views.ts, the one module that
// holds a WebContentsView, and browser-page.ts, the one that drives a page's content. Nothing here
// decides anything: every rule is in the actions, browser-tabs.ts and browser-holds.ts, so each action
// is tested against a fake of these (browser-fixture.ts).

// What an agent does in a page, on an element a snapshot named (its DOM node), or a key to the page.
export type PageAct =
  | { kind: 'click'; node: number }
  | { kind: 'type'; node: number; text: string }
  | { kind: 'press'; key: KeyEvent; node: number | null }
  | { kind: 'upload'; node: number; files: readonly string[] };

export type BrowserPorts = {
  browserOf(projectPath: string): BrowserState;
  // Every project's tabs, for a door that names a tab by its id alone: the browser command.
  allBrowsers(): ReadonlyMap<string, BrowserState>;
  // The project's tabs as they now are: kept, sent to the window, and the view on screen put right.
  keep(projectPath: string, state: BrowserState): void;
  // A new tab's view, loading `url`; answers the tab's id.
  makeView(projectPath: string, url: string): number;
  dropView(id: number): void;
  load(id: number, url: string): void;
  step(id: number, step: BrowserStep): void;
  // The project whose tab on screen is drawn, and where; null draws none.
  place(placed: BrowserPlacement | null): void;
  focus(id: number): void;
  // The page laid out as if its window were this size, or as the view is again for null.
  emulate(id: number, size: ViewportSize | null): Promise<void>;
  // The element refs the tab's last snapshot handed out, each to its DOM node.
  refsOf(id: number): ReadonlyMap<string, number>;
  act(id: number, act: PageAct): Promise<void>;
  // Whether the node is an <input type=file>, and if so whether it takes more than one file.
  fileInputOf(id: number, node: number): Promise<{ multiple: boolean } | null>;
  // A message into that page's main session, queued behind its turn: the tabs a pane let go of left open.
  tellMain(slot: number, text: string): void;
  // Whether a file is there to upload: a regular file this user can see.
  isFile(file: string): Promise<boolean>;
  // The script run in the page once `waitFor` matches, if one is given: the line saying where its
  // answer was saved, or why it was not.
  runScript(id: number, script: string, waitFor: string | null): Promise<string | Refused>;
};
