import { modelTone, statusMeters, type ChatMeasure, type StatusTone } from './chat-status';

// The row under the Claude screen's box as DOM: on the left the model, the mode and what Claude is
// doing; on the right the meters Claude Code's status line carries, then the version. What the meters
// say is chat-status.ts's; this only builds the elements.

export type FootState = 'ready' | 'working' | 'waiting';

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

export function footSides(model: string, mode: string, state: FootState, measured: ChatMeasure | null, version: string | null): HTMLElement[] {
  const chosen = document.createElement('div');
  chosen.className = 'chat-foot-side';
  const stateName = piece('chat-foot-state', STATE_LABELS[state]);
  stateName.dataset.state = state;
  chosen.append(toned(piece('chat-foot-model', model), modelTone(model)), piece('chat-foot-mode', mode), stateName);
  const meters = document.createElement('div');
  meters.className = 'chat-foot-side';
  for (const each of measured ? statusMeters(measured) : []) {
    const meter = toned(piece('chat-meter', ''), each.tone);
    meter.style.setProperty('--used', `${Math.min(100, each.percentage)}%`);
    meter.append(
      piece('chat-meter-label', each.label), piece('chat-meter-bar', ''),
      piece('chat-meter-value', `${Math.floor(each.percentage)}%`),
      ...(each.detail ? [piece('chat-meter-detail', each.detail)] : []),
    );
    meters.append(meter);
  }
  if (version) meters.append(piece('chat-foot-version', `v${version}`));
  return [chosen, meters];
}
