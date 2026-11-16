// Writes that leave an element alone when it already says the same thing. Setting textContent, a class
// or `hidden` to what it already was, or putting a list's own children back, still marks the element
// changed, and one changed element is enough for the window to lay the whole page out again before the
// next frame. The manager's page draws on every arrival, so a draw with nothing new must touch nothing.
import { sameItems } from '../../shared/app/same-items';

export function writeText(cell: Element | null | undefined, text: string): void {
  if (cell && cell.textContent !== text) cell.textContent = text;
}

export function writeHidden(element: HTMLElement | null | undefined, hidden: boolean): void {
  if (element && element.hidden !== hidden) element.hidden = hidden;
}

// A list's children, put in only when they are not already the ones it holds in that order. `same` is
// for children built afresh on every draw, compared by what they hold rather than by identity.
export function putChildren(list: Element, children: readonly Element[], same?: (one: Element, other: Element) => boolean): void {
  if (!sameItems([...list.children], children, same)) list.replaceChildren(...children);
}

export const sameNode = (one: Node, other: Node): boolean => one.isEqualNode(other);
