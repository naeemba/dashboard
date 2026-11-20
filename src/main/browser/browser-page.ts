import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Refused } from '../../shared/app/bridge';
import { isRecord } from '../../shared/app/is-record';
import { NO_TABS, type BrowserState, type ViewportSize } from '../../shared/browser/browser';
import type { PageAct } from '../actions/browser/browser-ports';
import { isRefused } from '../actions/action';
import { heldTab, tabLines } from './browser-holds';
import type { PagePorts } from './browser-views';
import { DEFAULT_READ_TOKENS, READ_SCRIPT, readingText, readPage, type ReaderPage } from './page-reader';
import { snapshotOf, type AXNode } from './page-snapshot';

// The one module that drives a page's content, over the DevTools protocol browser-views.ts attaches
// to a tab: the reads the browser command answers (read, screenshot, snapshot, console, network,
// tabs), and what the page actions do (browser.resize, click, type, press). A read changes no browser
// state, so it is no action, but it is held to the same claim: a pane reads only a tab it holds.
// Electron wiring: what it decides is in page-reader.ts, page-snapshot.ts, page-log.ts and
// browser-holds.ts.

// The tallest page a full screenshot takes: past it, the picture is a strip nobody reads.
const TALLEST_SHOT = 16_000;

type ReadOptions = { maxTokens: number | null; selector: string | null };
type ShotOptions = { full: boolean; element: string | null };

// What Runtime.evaluate answers: the value, or the exception the expression threw.
function evaluated(answer: unknown): { value: unknown } | { thrown: string } {
  if (!isRecord(answer)) return { thrown: 'the page answered nothing' };
  if (isRecord(answer.exceptionDetails)) {
    const exception = isRecord(answer.exceptionDetails.exception) ? answer.exceptionDetails.exception.description : undefined;
    return { thrown: typeof exception === 'string' ? exception.split('\n')[0] : String(answer.exceptionDetails.text) };
  }
  return { value: isRecord(answer.result) ? answer.result.value : undefined };
}

export function browserPage(pages: PagePorts, allBrowsers: () => ReadonlyMap<string, BrowserState>, folder: string) {
  // Each tab's refs from its last snapshot, to the DOM node each names.
  // ponytail: a closed tab's refs stay, a small map per tab ever snapshotted; drop them on close if it shows.
  const refs = new Map<number, Map<string, number>>();

  async function evaluate(id: number, expression: string): Promise<{ value: unknown } | { thrown: string }> {
    return evaluated(await pages.send(id, 'Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }));
  }

  async function emulate(id: number, size: ViewportSize | null): Promise<void> {
    if (size === null) await pages.send(id, 'Emulation.clearDeviceMetricsOverride');
    else await pages.send(id, 'Emulation.setDeviceMetricsOverride', { ...size, deviceScaleFactor: 0, mobile: false });
  }

  // The middle of the element on the page, scrolled into view first.
  async function middleOf(id: number, node: number): Promise<{ x: number; y: number }> {
    await pages.send(id, 'DOM.scrollIntoViewIfNeeded', { backendNodeId: node });
    const box = await pages.send(id, 'DOM.getBoxModel', { backendNodeId: node });
    const quad = isRecord(box) && isRecord(box.model) && Array.isArray(box.model.content) ? box.model.content as number[] : [];
    if (quad.length < 8) throw new Error('the element has no box on the page; take a new snapshot');
    return { x: (quad[0] + quad[4]) / 2, y: (quad[1] + quad[5]) / 2 };
  }

  async function act(id: number, done: PageAct): Promise<void> {
    if (done.kind === 'click') {
      const { x, y } = await middleOf(id, done.node);
      for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
        await pages.send(id, 'Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: type === 'mouseMoved' ? 0 : 1 });
      }
      return;
    }
    if (done.node !== null) await pages.send(id, 'DOM.focus', { backendNodeId: done.node });
    if (done.kind === 'type') {
      await pages.send(id, 'Input.insertText', { text: done.text });
      return;
    }
    const { key, code, keyCode, text } = done.key;
    const shared = { key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode };
    await pages.send(id, 'Input.dispatchKeyEvent', { type: text === undefined ? 'rawKeyDown' : 'keyDown', ...shared, ...(text === undefined ? {} : { text }) });
    await pages.send(id, 'Input.dispatchKeyEvent', { type: 'keyUp', ...shared });
  }

  async function read(id: number, { maxTokens, selector }: ReadOptions): Promise<string | Refused> {
    const page = await evaluate(id, `(${READ_SCRIPT})(${JSON.stringify(selector)})`);
    if ('thrown' in page) return { refused: selector === null ? `tab ${id}'s page could not be read: ${page.thrown}` : `${selector} is not a selector the page takes: ${page.thrown}` };
    const value = page.value as ReaderPage;
    if (selector !== null && value.tree === null) return { refused: `nothing in tab ${id} matches ${selector}` };
    const budget = maxTokens ?? DEFAULT_READ_TOKENS;
    return readingText(id, readPage(value, budget), budget);
  }

  // The page's whole length at its own width, drawn past the viewport.
  async function fullShot(id: number): Promise<Buffer> {
    const metrics = await pages.send(id, 'Page.getLayoutMetrics');
    const content = isRecord(metrics) && isRecord(metrics.cssContentSize) ? metrics.cssContentSize : {};
    const width = Math.ceil(Number(content.width) || 0);
    const height = Math.min(Math.ceil(Number(content.height) || 0), TALLEST_SHOT);
    if (width === 0 || height === 0) return pages.capture(id);
    const shot = await pages.send(id, 'Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height, scale: 1 },
    });
    return Buffer.from(isRecord(shot) && typeof shot.data === 'string' ? shot.data : '', 'base64');
  }

  async function elementShot(id: number, selector: string): Promise<Buffer | Refused> {
    const box = await evaluate(id, `(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) return null;`
      + ` element.scrollIntoView({ block: 'center' }); const box = element.getBoundingClientRect();`
      + ' return { x: box.x, y: box.y, width: box.width, height: box.height }; })()');
    if ('thrown' in box) return { refused: `${selector} is not a selector the page takes: ${box.thrown}` };
    if (!isRecord(box.value)) return { refused: `nothing in tab ${id} matches ${selector}` };
    const [x, y, width, height] = [box.value.x, box.value.y, box.value.width, box.value.height].map((side) => Math.max(0, Math.round(Number(side) || 0)));
    if (width === 0 || height === 0) return { refused: `${selector} in tab ${id} has no size on screen` };
    return pages.capture(id, { x, y, width, height });
  }

  async function screenshot(id: number, { full, element }: ShotOptions): Promise<string | Refused> {
    const picture = element !== null ? await elementShot(id, element) : full ? await fullShot(id) : await pages.capture(id);
    if (isRefused(picture)) return picture;
    if (picture.length === 0) return { refused: `tab ${id} drew nothing to take a picture of` };
    await mkdir(folder, { recursive: true });
    const file = path.join(folder, `tab-${id}-${new Date().toISOString().replace(/[:.]/g, '-')}.png`);
    await writeFile(file, picture);
    return file;
  }

  async function snapshot(id: number): Promise<string> {
    const tree = await pages.send(id, 'Accessibility.getFullAXTree');
    const nodes = isRecord(tree) && Array.isArray(tree.nodes) ? tree.nodes as AXNode[] : [];
    const made = snapshotOf(id, nodes);
    refs.set(id, made.refs);
    return made.text;
  }

  // Each read, for the tab the pane names, once it is the pane's.
  const reading = <Options>(run: (id: number, options: Options) => Promise<string | Refused>) =>
    async (pane: string, tab: number, options: Options): Promise<string | Refused> => {
      const found = heldTab(allBrowsers(), pane, tab);
      return isRefused(found) ? found : run(tab, options);
    };

  return {
    // The ports the page actions are given (browser-ports.ts).
    ports: { emulate, act, refsOf: (id: number): ReadonlyMap<string, number> => refs.get(id) ?? new Map() },
    reads: {
      tabs: (pane: string, projectPath: string): string => tabLines(allBrowsers().get(projectPath) ?? NO_TABS, pane),
      read: reading(read),
      screenshot: reading(screenshot),
      snapshot: reading(snapshot),
      console: reading(async (id) => pages.logOf(id)?.consoleText(id) ?? ''),
      network: reading(async (id) => pages.logOf(id)?.networkText(id) ?? ''),
    },
  };
}

export type BrowserReads = ReturnType<typeof browserPage>['reads'];
