import { icon } from './icons';
import { renderMarkdown, safeImage } from './chat-markdown';
import { toolDiff, toolSummary } from './chat-tools';
import { baseName } from './base-name';
import { pdfMentions, pdfOfTool } from './chat-pdf';
import { foldedMessage } from './chat-fold';
import { imageDataUrl, type ChatEntry, type ChatImage, type ToolResult } from './chat-transcript';

// One entry of the conversation as DOM. What it draws was decided in chat-transcript.ts, chat-tools.ts
// and chat-markdown.ts; this only builds the elements.
//
// The expensive half of an entry is left for later: markdown and highlighting for a block of text, the
// diff and output for a tool call. `fill` does it, and the view calls it when the entry comes near the
// screen, so a long conversation read back from disk costs a row of empty boxes until it is scrolled.

export type DrawnEntry = { entry: ChatEntry; element: HTMLElement; fill: (() => void) | null };

function images(list: ChatImage[]): HTMLImageElement[] {
  return list.flatMap((picture) => {
    const source = safeImage(imageDataUrl(picture));
    if (!source) return [];
    const image = document.createElement('img');
    image.className = 'chat-image';
    image.decoding = 'async';
    image.src = source;
    return [image];
  });
}

// A PDF the conversation names, as a tile the size of a line. Its path is kept on it for the view,
// which asks main for the file when the tile is clicked or the image key is pressed on its entry.
export const PDF_TILE = 'chat-pdf';

function pdfTile(file: string): HTMLElement {
  const tile = document.createElement('div');
  tile.className = PDF_TILE;
  tile.dataset.path = file;
  tile.title = file;
  const kind = document.createElement('b');
  kind.textContent = '[PDF File]';
  const name = document.createElement('span');
  name.className = PDF_TILE_NAME;
  tile.append(kind, name);
  pdfTileState(tile, null);
  return tile;
}

const PDF_TILE_NAME = 'chat-pdf-name';

// What a tile says after main was asked for its file: the name alone once the file opened, or the
// name and why main would not hand it over. A file that turns up later clears the reason.
export function pdfTileState(tile: HTMLElement, refused: string | null): void {
  const name = baseName(tile.dataset.path ?? '');
  tile.querySelector(`.${PDF_TILE_NAME}`)?.replaceChildren(refused === null ? name : `${name} — ${refused}`);
}

// A copy button in a code block's corner, for what the block holds. It shows a tick for a moment once
// the text is on the clipboard. The button sits in a wrapper around the block, not in it: the block
// scrolls sideways, and a button inside would scroll away with a long line. A block already in the
// page is swapped for its wrapper in place.
function withCopy(pre: HTMLElement): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'chat-block';
  pre.replaceWith(wrapper);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'chat-copy';
  button.title = 'Copy';
  button.append(icon('copy'));
  let reverting = 0;
  button.addEventListener('click', () => {
    const text = (pre.querySelector('code') ?? pre).textContent ?? '';
    void navigator.clipboard.writeText(text.replace(/\n$/, '')).then(() => {
      button.replaceChildren(icon('copied'));
      window.clearTimeout(reverting);
      reverting = window.setTimeout(() => button.replaceChildren(icon('copy')), 1200);
    });
  });
  wrapper.append(pre, button);
  return wrapper;
}

// Markdown drawn into an element, each code block with its copy button.
function markdownInto(element: HTMLElement, text: string): void {
  element.innerHTML = renderMarkdown(text);
  element.querySelectorAll('pre').forEach(withCopy);
}

function preformatted(className: string, text: string): HTMLPreElement {
  const pre = document.createElement('pre');
  pre.className = className;
  pre.textContent = text;
  return pre;
}

// What a subagent did, under the call that started it: what it said, and each tool it called as its
// one line. Nothing in it unfolds, since the selection keys walk only the main conversation; a
// subagent's own subagent shows its steps under its line, indented. A subagent's every message redraws
// its call, so a step already drawn is moved into the new body rather than rendered again; notices,
// which can be one shared object, are drawn fresh.
const drawnSteps = new WeakMap<ChatEntry, HTMLElement>();

function stepsOf(steps: ChatEntry[]): HTMLElement {
  const element = document.createElement('div');
  element.className = 'chat-steps';
  for (const step of steps) {
    if (step.kind === 'tool') {
      element.append(toolLine('div', step));
      if (step.steps?.length) element.append(stepsOf(step.steps));
      continue;
    }
    // A notice is cheap to draw and may be one shared object (every "Stopped." is), and a cached
    // element can sit in only one place, so notices are drawn fresh each time.
    if (step.kind === 'notice') {
      element.append(drawEntry(step).element);
      continue;
    }
    let drawn = drawnSteps.get(step);
    if (!drawn) {
      const fresh = drawEntry(step);
      fresh.fill?.();
      drawn = fresh.element;
      drawnSteps.set(step, drawn);
    }
    element.append(drawn);
  }
  return element;
}

// The call itself, what a subagent it started did, then what came back. A file tool shows its change
// as a diff, a plan put up for approval reads as the document it is; anything else shows its input,
// which for Bash is the whole command rather than the first line the summary had room for.
export function toolBody(name: string, input: Record<string, unknown>, result: ToolResult | null, steps: ChatEntry[] = []): HTMLElement[] {
  const diff = toolDiff(name, input);
  const parts: HTMLElement[] = [];
  const pdf = pdfOfTool(name, input);
  if (pdf) parts.push(pdfTile(pdf));
  if (name === 'ExitPlanMode' && typeof input.plan === 'string') {
    const plan = document.createElement('div');
    plan.className = 'chat-plan chat-text';
    markdownInto(plan, input.plan);
    parts.push(plan);
  } else if (diff) {
    const pre = document.createElement('pre');
    pre.className = 'chat-diff';
    pre.append(...diff.map((line) => {
      const row = document.createElement('span');
      row.className = { ' ': 'diff-same', '-': 'diff-removed', '+': 'diff-added' }[line.sign];
      row.textContent = `${line.sign} ${line.text}\n`;
      return row;
    }));
    parts.push(withCopy(pre));
  } else {
    parts.push(withCopy(preformatted('chat-input', typeof input.command === 'string' ? input.command : JSON.stringify(input, null, 2))));
  }
  if (steps.length > 0) parts.push(stepsOf(steps));
  if (result) {
    if (result.text) parts.push(withCopy(preformatted(result.isError ? 'chat-output chat-error' : 'chat-output', result.text)));
    parts.push(...images(result.images));
  }
  return parts;
}

// A call's one line: whether it finished, its name, and what it was about.
function toolLine(tag: 'summary' | 'div', entry: Extract<ChatEntry, { kind: 'tool' }>): HTMLElement {
  const line = document.createElement(tag);
  if (tag === 'div') line.className = 'chat-step-tool';
  const [look, mark] = entry.result === null ? ['running', '…'] : entry.result.isError ? ['failed', '✗'] : ['', '✓'];
  const state = document.createElement('span');
  state.className = `chat-tool-state ${look}`.trim();
  state.textContent = mark;
  const name = document.createElement('b');
  name.textContent = entry.name;
  const about = document.createElement('span');
  about.className = 'chat-tool-summary';
  about.textContent = toolSummary(entry.name, entry.input);
  line.append(state, name, about);
  return line;
}

function toolEntry(entry: Extract<ChatEntry, { kind: 'tool' }>): DrawnEntry {
  const element = document.createElement('details');
  element.className = 'chat-entry chat-tool';
  element.append(toolLine('summary', entry));
  // The body is built the first time the call is unfolded, not before: most never are.
  let built = false;
  element.addEventListener('toggle', () => {
    if (!element.open || built) return;
    built = true;
    element.append(...toolBody(entry.name, entry.input, entry.result, entry.steps));
  });
  return { entry, element, fill: null };
}

// A message Claude Code injected, or Claude's thinking: one line with its title, unfolding to what it
// said in markdown.
function eventEntry(entry: Extract<ChatEntry, { kind: 'event' }>): DrawnEntry {
  const element = document.createElement('details');
  element.className = 'chat-entry chat-event';
  const summary = document.createElement('summary');
  summary.textContent = entry.title;
  const body = document.createElement('div');
  body.className = 'chat-text';
  element.append(summary, body);
  element.addEventListener('toggle', () => {
    if (!element.open || body.childElementCount > 0) return;
    markdownInto(body, entry.body);
  });
  return { entry, element, fill: null };
}

function paragraph(text: string): HTMLParagraphElement {
  const said = document.createElement('p');
  said.textContent = text;
  return said;
}

// What you sent. A long one is folded like a tool call: its first lines are the summary, with a row
// counting the rest, and a click or the unfold key opens the whole of it.
function userEntry(entry: Extract<ChatEntry, { kind: 'user' }>): DrawnEntry {
  const extras = [...pdfMentions(entry.text).map(pdfTile), ...images(entry.images)];
  const folded = foldedMessage(entry.text);
  if (!folded) {
    const element = document.createElement('div');
    element.className = 'chat-entry chat-user';
    element.append(paragraph(entry.text), ...extras);
    return { entry, element, fill: null };
  }
  // The attachments sit beside the fold, not in it: a closed <details> draws only its summary.
  const element = document.createElement('div');
  element.className = 'chat-entry chat-user';
  const fold = document.createElement('details');
  fold.className = 'chat-folded';
  const summary = document.createElement('summary');
  const more = document.createElement('span');
  more.className = 'chat-more';
  more.textContent = `… ${folded.hidden} more lines`;
  summary.append(paragraph(folded.head), more);
  // The rest is built the first time it is unfolded: a pasted log is rarely read back.
  const rest = paragraph('');
  fold.append(summary, rest);
  fold.addEventListener('toggle', () => {
    if (fold.open && !rest.textContent) rest.textContent = folded.rest;
  });
  element.append(fold, ...extras);
  return { entry, element, fill: null };
}

// The part of a drawn entry the unfold key opens: a tool call or event is one, a long message holds one.
export function foldOf(element: HTMLElement): HTMLDetailsElement | null {
  if (element instanceof HTMLDetailsElement) return element;
  return element.querySelector<HTMLDetailsElement>(':scope > details.chat-folded');
}

export function drawEntry(entry: ChatEntry): DrawnEntry {
  if (entry.kind === 'tool') return toolEntry(entry);
  if (entry.kind === 'event') return eventEntry(entry);
  if (entry.kind === 'user') return userEntry(entry);
  const element = document.createElement('div');
  element.className = `chat-entry chat-${entry.kind}`;
  if (entry.kind === 'notice') {
    element.textContent = entry.text;
    return { entry, element, fill: null };
  }
  if (entry.kind === 'shell') {
    // Nothing to copy when it printed nothing, so the placeholder gets no button.
    element.append(entry.text ? withCopy(preformatted('chat-output', entry.text)) : preformatted('chat-output', '(no output)'));
    return { entry, element, fill: null };
  }
  // Until it is filled the box holds the raw text, so a conversation scrolled fast still reads.
  element.textContent = entry.text;
  return {
    entry, element, fill: () => {
      markdownInto(element, entry.text);
    },
  };
}
