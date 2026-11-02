import type { Action } from '../../shared/keys/actions';
import { isModified } from '../keys/shortcuts';

// Read off the action rather than spelled out again: a field the table can ask for and this file has
// never heard of would otherwise be a key that does nothing.
export type EditableField = Extract<Action, { kind: 'board-edit' }>['field'];

// Which fields are typed over more than one line. They get a textarea, Enter makes a newline in them
// and Escape is what commits — the other three are one line and end on Enter. Listed once, because a
// field added to the textarea half and forgotten in the commit half is a box you cannot get out of.
export const MULTILINE: readonly EditableField[] = ['notes', 'comment'];

// The box a card's field is typed into on the board. Both editors are the same control with a
// different tag and a different commit key, so they are one function: a title is one line and Enter
// ends it, a description is many and Enter is a newline in it. `isOpen` says whether this field is
// still the one being edited, so a blur after the box was already committed does not commit it twice.
export function cardEditor(
  field: EditableField,
  value: string,
  commit: (value: string) => void,
  isOpen: () => boolean,
): HTMLElement {
  const input: HTMLInputElement | HTMLTextAreaElement =
    MULTILINE.includes(field) ? document.createElement('textarea') : document.createElement('input');
  input.className = 'board-edit';
  input.value = value;
  // The comment box is the one that opens empty, so it is the one that has to say what it is. The
  // others open holding the field they edit.
  if (field === 'comment') input.placeholder = 'Comment';
  // A title or a description typed in Persian turns the box round as you type.
  input.dir = 'auto';
  // onkeydown rather than addEventListener: both tags declare it as taking a KeyboardEvent, which the
  // union of the two does not do for the listener overloads.
  input.onkeydown = (event) => {
    // Returning without preventDefault, so Cmd+A and Cmd+V still do what they do in any text box.
    if (isModified(event)) return;
    const commits = MULTILINE.includes(field) ? event.key === 'Escape' : event.key === 'Enter' || event.key === 'Escape';
    if (!commits) return;
    event.preventDefault();
    commit(input.value);
  };
  input.onblur = () => {
    if (isOpen()) commit(input.value);
  };
  return input;
}
