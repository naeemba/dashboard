import path from 'node:path';
import type { Refused } from '../../../shared/app/bridge';
import { stringOrEmpty } from '../../../shared/app/is-record';
import type { ViewportSize } from '../../../shared/browser/browser';
import { isRefused, action } from '../action';
import { KEY_NAMES, keyEventOf, type KeyEvent } from '../../browser/page-keys';
import { wholeNumber } from '../../browser/browser-tabs';
import type { BrowserPorts } from './browser-ports';
import { agentInput, targetTab, type AgentTarget } from './target';

// browser.resize, browser.click, browser.type, browser.press, browser.upload and browser.eval: what an agent does to a page it
// holds, through the browser command. An element is named by a ref from the tab's last snapshot
// (browser-page.ts), the accessibility tree trimmed to what can be clicked or typed in.

// Wide and tall enough for a phone held either way and a desktop, and no wider than a screen goes.
const LARGEST_SIDE = 4000;
const SMALLEST_SIDE = 100;

function sizeOf(raw: Record<string, unknown>): ViewportSize | null | Refused {
  if (raw.width === undefined && raw.height === undefined) return null;
  const width = wholeNumber(raw.width);
  const height = wholeNumber(raw.height);
  const fits = (side: number | null) => side !== null && side >= SMALLEST_SIDE && side <= LARGEST_SIDE;
  if (!fits(width) || !fits(height)) return { refused: `a size is two whole numbers from ${SMALLEST_SIDE} to ${LARGEST_SIDE}, like 390x844` };
  return { width: width as number, height: height as number };
}

// A size lays the page out as a window that size would; none puts it back as the view is.
export const browserResize = action<BrowserPorts, AgentTarget & { size: ViewportSize | null }, { output: string }>('browser.resize', {
  words: ['tab'],
  input(raw) {
    const target = agentInput(raw);
    if (isRefused(target)) return target;
    const size = sizeOf(raw);
    return isRefused(size) ? size : { ...target, size };
  },
  async run(ports, { pane, tab, size }) {
    const found = targetTab(ports, { pane, tab });
    if (isRefused(found)) return found;
    await ports.emulate(tab, size);
    return { output: size === null ? `tab ${tab} is as its view is` : `tab ${tab} laid out at ${size.width}x${size.height}` };
  },
});

// The element a ref names in the tab's last snapshot, once the pane holds the tab.
function heldNode(ports: BrowserPorts, { pane, tab }: AgentTarget, ref: string): number | Refused {
  const found = targetTab(ports, { pane, tab });
  if (isRefused(found)) return found;
  return ports.refsOf(tab).get(ref) ?? { refused: `tab ${tab}'s last snapshot has no ${ref}; take one with \`browser snapshot ${tab}\`` };
}

// The pane, the tab and the element ref an act names, or why not.
function refTarget(raw: Record<string, unknown>): AgentTarget & { ref: string } | Refused {
  const target = agentInput(raw);
  if (isRefused(target)) return target;
  const ref = stringOrEmpty(raw.ref).trim();
  return ref === '' ? { refused: 'no element was named: a ref from `browser snapshot`, like e3' } : { ...target, ref };
}

export const browserClick = action<BrowserPorts, AgentTarget & { ref: string }, { output: string }>('browser.click', {
  words: ['tab', 'ref'],
  input: refTarget,
  async run(ports, input) {
    const node = heldNode(ports, input, input.ref);
    if (isRefused(node)) return node;
    await ports.act(input.tab, { kind: 'click', node });
    return { output: `clicked ${input.ref} in tab ${input.tab}` };
  },
});

export const browserType = action<BrowserPorts, AgentTarget & { ref: string; text: string }, { output: string }>('browser.type', {
  words: ['tab', 'ref', 'text'],
  input(raw) {
    const target = refTarget(raw);
    if (isRefused(target)) return target;
    return typeof raw.text === 'string' && raw.text !== '' ? { ...target, text: raw.text } : { refused: 'no text was given to type' };
  },
  async run(ports, input) {
    const node = heldNode(ports, input, input.ref);
    if (isRefused(node)) return node;
    await ports.act(input.tab, { kind: 'type', node, text: input.text });
    return { output: `typed into ${input.ref} in tab ${input.tab}` };
  },
});

// A key to the page, to the element named first when a ref is given.
export const browserPress = action<BrowserPorts, AgentTarget & { key: KeyEvent; ref: string | null }, { output: string }>('browser.press', {
  words: ['tab', 'key'],
  input(raw) {
    const key = keyEventOf(stringOrEmpty(raw.key));
    if (key === null) return { refused: `a key is one character or one of ${KEY_NAMES}` };
    const target = raw.ref === undefined || raw.ref === null ? agentInput(raw) : refTarget(raw);
    return isRefused(target) ? target : { ref: null, ...target, key };
  },
  async run(ports, input) {
    const held = input.ref === null ? targetTab(ports, input) : heldNode(ports, input, input.ref);
    if (isRefused(held)) return held;
    await ports.act(input.tab, { kind: 'press', key: input.key, node: typeof held === 'number' ? held : null });
    return { output: `pressed ${input.key.key === ' ' ? 'Space' : input.key.key} in tab ${input.tab}` };
  },
});

// Files set on an <input type=file>, as a person's pick in the file dialog would: a form's CV. A
// path is made whole by the command, against the folder it runs in (browser-program.ts).
export const browserUpload = action<BrowserPorts, AgentTarget & { ref: string; files: string[] }, { output: string }>('browser.upload', {
  words: ['tab', 'ref', 'files'],
  input(raw) {
    const target = refTarget(raw);
    if (isRefused(target)) return target;
    const files = Array.isArray(raw.files) ? raw.files.map(stringOrEmpty) : [];
    if (files.length === 0 || files.includes('')) return { refused: 'no file was named to upload' };
    const partial = files.find((file) => !path.isAbsolute(file));
    return partial === undefined ? { ...target, files } : { refused: `${partial} is not a whole path` };
  },
  async run(ports, input) {
    const node = heldNode(ports, input, input.ref);
    if (isRefused(node)) return node;
    const fileInput = await ports.fileInputOf(input.tab, node);
    if (fileInput === null) return { refused: `${input.ref} is not a file input; a snapshot lists those as file` };
    if (input.files.length > 1 && !fileInput.multiple) return { refused: `${input.ref} takes one file, and ${input.files.length} were named` };
    for (const file of input.files) {
      if (!await ports.isFile(file)) return { refused: `there is no file at ${file}` };
    }
    await ports.act(input.tab, { kind: 'upload', node, files: input.files });
    const count = input.files.length === 1 ? path.basename(input.files[0]) : `${input.files.length} files`;
    return { output: `put ${count} in ${input.ref} in tab ${input.tab}` };
  },
});

// A script the agent wrote, run in the page it holds: anything a page's own code may do, which is
// why it is an action and not a read.
export const browserEval = action<BrowserPorts, AgentTarget & { script: string; waitFor: string | null }, { output: string }>('browser.eval', {
  words: ['tab', 'script'],
  input(raw) {
    const target = agentInput(raw);
    if (isRefused(target)) return target;
    if (typeof raw.script !== 'string' || raw.script.trim() === '') return { refused: 'the script is empty' };
    const waitFor = stringOrEmpty(raw.waitFor).trim();
    return { ...target, script: raw.script, waitFor: waitFor === '' ? null : waitFor };
  },
  async run(ports, { pane, tab, script, waitFor }) {
    const found = targetTab(ports, { pane, tab });
    if (isRefused(found)) return found;
    const said = await ports.runScript(tab, script, waitFor);
    return isRefused(said) ? said : { output: said };
  },
});
