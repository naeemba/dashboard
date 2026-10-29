import { renderMarkdown, safeImage } from './chat-markdown';
import { toolDiff, toolSummary } from './chat-tools';
import type { ChatEntry, ChatImage, ToolResult } from './chat-transcript';

// One entry of the conversation as DOM. What it draws was decided in chat-transcript.ts, chat-tools.ts
// and chat-markdown.ts; this only builds the elements.
//
// The expensive half of an entry is left for later: markdown and highlighting for a block of text, the
// diff and output for a tool call. `fill` does it, and the view calls it when the entry comes near the
// screen, so a long conversation read back from disk costs a row of empty boxes until it is scrolled.

export type DrawnEntry = { entry: ChatEntry; element: HTMLElement; fill: (() => void) | null };

function images(list: ChatImage[]): HTMLImageElement[] {
  return list.flatMap((picture) => {
    const source = safeImage(`data:${picture.mediaType};base64,${picture.data}`);
    if (!source) return [];
    const image = document.createElement('img');
    image.className = 'chat-image';
    image.src = source;
    return [image];
  });
}

function preformatted(className: string, text: string): HTMLPreElement {
  const pre = document.createElement('pre');
  pre.className = className;
  pre.textContent = text;
  return pre;
}

// The call itself, then what came back. A file tool shows its change as a diff; anything else shows
// its input, which for Bash is the whole command rather than the first line the summary had room for.
export function toolBody(name: string, input: Record<string, unknown>, result: ToolResult | null): HTMLElement[] {
  const diff = toolDiff(name, input);
  const parts: HTMLElement[] = [];
  if (diff) {
    const pre = document.createElement('pre');
    pre.className = 'chat-diff';
    pre.append(...diff.map((line) => {
      const row = document.createElement('span');
      row.className = { ' ': 'diff-same', '-': 'diff-removed', '+': 'diff-added' }[line.sign];
      row.textContent = `${line.sign} ${line.text}\n`;
      return row;
    }));
    parts.push(pre);
  } else {
    parts.push(preformatted('chat-input', typeof input.command === 'string' ? input.command : JSON.stringify(input, null, 2)));
  }
  if (result) {
    if (result.text) parts.push(preformatted(result.isError ? 'chat-output chat-error' : 'chat-output', result.text));
    parts.push(...images(result.images));
  }
  return parts;
}

function toolEntry(entry: Extract<ChatEntry, { kind: 'tool' }>): DrawnEntry {
  const element = document.createElement('details');
  element.className = 'chat-entry chat-tool';
  const summary = document.createElement('summary');
  const [look, mark] = entry.result === null ? ['running', '…'] : entry.result.isError ? ['failed', '✗'] : ['', '✓'];
  const state = document.createElement('span');
  state.className = `chat-tool-state ${look}`.trim();
  state.textContent = mark;
  const name = document.createElement('b');
  name.textContent = entry.name;
  const about = document.createElement('span');
  about.className = 'chat-tool-summary';
  about.textContent = toolSummary(entry.name, entry.input);
  summary.append(state, name, about);
  element.append(summary);
  // The body is built the first time the call is unfolded, not before: most never are.
  let built = false;
  element.addEventListener('toggle', () => {
    if (!element.open || built) return;
    built = true;
    element.append(...toolBody(entry.name, entry.input, entry.result));
  });
  return { entry, element, fill: null };
}

export function drawEntry(entry: ChatEntry): DrawnEntry {
  if (entry.kind === 'tool') return toolEntry(entry);
  const element = document.createElement('div');
  element.className = `chat-entry chat-${entry.kind}`;
  if (entry.kind === 'notice') {
    element.textContent = entry.text;
    return { entry, element, fill: null };
  }
  if (entry.kind === 'user') {
    const said = document.createElement('p');
    said.textContent = entry.text;
    element.append(said, ...images(entry.images));
    return { entry, element, fill: null };
  }
  // Until it is filled the box holds the raw text, so a conversation scrolled fast still reads.
  element.textContent = entry.text;
  return { entry, element, fill: () => { element.innerHTML = renderMarkdown(entry.text); } };
}
