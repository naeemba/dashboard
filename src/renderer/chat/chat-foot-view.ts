import type { CacheWarmth } from '../../shared/usage/cache-warmth';
import { FOOT_EFFORT, FOOT_MODE, FOOT_MODEL } from '../../shared/chat/foot-choices';
import { modelTone, statusMeters, type ChatMeasure, type StatusTone, type FootState } from '../../shared/chat/chat-status';

// The row under the Claude screen's box as DOM: on the left the model, the mode, the effort, what
// Claude is doing and how its workers stand; on the right the meters Claude Code's status line
// carries and the button that reads them again, whether the prompt cache is warm, then the version. What the meters say is
// chat-status.ts's; this only builds the elements.

const STATE_LABELS: Record<FootState, string> = { ready: 'ready', working: 'working', waiting: 'waiting on you' };

export function piece(className: string, text: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = text;
  return span;
}

function toned(element: HTMLElement, tone: StatusTone): HTMLElement {
  // Each tone is a theme colour of the same name; plain is the text's own.
  element.style.setProperty('--tone', `var(--${tone === 'plain' ? 'white' : tone})`);
  return element;
}

// The workers button, between what Claude is doing and the meters; a click opens the workers popup
// (chat-view.ts). Not drawn while the session has no worker open.
export const FOOT_WORKERS = 'chat-foot-workers';

// The context meter, which a click opens the context popup from (chat-context-view.ts).
export const FOOT_CONTEXT = 'chat-foot-context';

export function footSides(model: string, mode: string, effort: string, ultrathink: boolean, state: FootState, measured: ChatMeasure | null, cache: CacheWarmth | null, version: string | null, workers: string, refresh: HTMLElement): HTMLElement[] {
  const chosen = document.createElement('div');
  chosen.className = 'chat-foot-side';
  const stateName = piece('chat-foot-state', STATE_LABELS[state]);
  stateName.dataset.state = state;
  const effortName = piece(FOOT_EFFORT, effort);
  effortName.classList.toggle('ultrathink', ultrathink);
  chosen.append(toned(piece(FOOT_MODEL, model), modelTone(model)), piece(FOOT_MODE, mode), effortName, stateName);
  if (workers) chosen.append(piece(FOOT_WORKERS, workers));
  const meters = document.createElement('div');
  meters.className = 'chat-foot-side';
  for (const each of measured ? statusMeters(measured) : []) {
    const meter = toned(piece('chat-meter', ''), each.tone);
    if (each.label === 'context') meter.classList.add(FOOT_CONTEXT);
    meter.style.setProperty('--used', `${Math.min(100, each.percentage)}%`);
    meter.append(
      piece('chat-meter-label', each.label), piece('chat-meter-bar', ''),
      piece('chat-meter-value', `${Math.floor(each.percentage)}%`),
      ...(each.detail ? [piece('chat-meter-detail', each.detail)] : []),
    );
    meters.append(meter);
  }
  // The refresh button, after the meters it reads again; the view keeps the one element, so its spin
  // survives a redraw.
  if (measured) meters.append(refresh);
  // Whether the prompt cache is warm, beside the meters: green, yellow in its last five minutes.
  if (cache) meters.append(toned(piece('chat-foot-cache', cache.text), cache.tone));
  if (version) meters.append(piece('chat-foot-version', `v${version}`));
  return [chosen, meters];
}
