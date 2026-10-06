// A key binding as it is printed — "Ctrl+Shift+B", or a run such as "Shift+1…Shift+9" — split into the
// keys you press, so each can be drawn as its own keycap. A bare "+" is a key too: "Ctrl++" is Ctrl and
// plus, not Ctrl and two nothings. Whatever joins two bindings ("…") comes back as a joiner and is drawn
// as text between the caps.
export type KeyPart = { key: string } | { joiner: string };

export function keyParts(binding: string): KeyPart[] {
  const parts: KeyPart[] = [];
  binding.split('…').forEach((chord, index) => {
    if (index > 0) parts.push({ joiner: '…' });
    for (const key of chord.split(/\+(?!$)/)) parts.push({ key: key === '' ? '+' : key });
  });
  return parts;
}

export function keycaps(binding: string): HTMLElement {
  const element = document.createElement('span');
  element.className = 'keycaps';
  element.append(...keyParts(binding).map((part) => {
    if ('joiner' in part) return part.joiner;
    const cap = document.createElement('kbd');
    cap.textContent = part.key;
    return cap;
  }));
  return element;
}
