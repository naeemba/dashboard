import { parseBinding } from './binding';

// A key binding as it is printed — "Ctrl+Shift+B", or a run such as "Shift+1…Shift+9" — split into the
// keys you press, so each can be drawn as its own keycap. Whatever joins two bindings ("…") comes back
// as a joiner and is drawn as text between the caps.
export type KeyPart = { key: string } | { joiner: string };

export function keyParts(binding: string): KeyPart[] {
  const parts: KeyPart[] = [];
  binding.split('…').forEach((chord, index) => {
    if (index > 0) parts.push({ joiner: '…' });
    for (const key of chord.split('+')) parts.push({ key });
  });
  return parts;
}

// Caps only for a real binding. A row that describes keys rather than naming one — "Everything else"
// on nvim — stays prose, or it would be drawn as a key of that name.
export function drawsAsKeys(binding: string): boolean {
  return binding.split('…').every((chord) => parseBinding(chord) !== null);
}

export function keycaps(binding: string): HTMLElement {
  const element = document.createElement('span');
  element.className = 'keycaps';
  if (!drawsAsKeys(binding)) {
    element.textContent = binding;
    return element;
  }
  element.append(...keyParts(binding).map((part) => {
    if ('joiner' in part) return part.joiner;
    const cap = document.createElement('kbd');
    cap.textContent = part.key;
    return cap;
  }));
  return element;
}
