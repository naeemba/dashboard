import type { KeyInput } from './binding';
import { mapShortcut } from './lookup';
import type { Settings } from '../settings/settings';

// A key as Electron reports one pressed inside a web contents (its before-input-event).
export type PageKey = {
  type: string; key: string; code: string; shift: boolean; control: boolean; alt: boolean; meta: boolean;
};

// Whether a key pressed inside the browser view leaves the page for the window, and as what. A web
// page has the keyboard to itself, so the window hears nothing it is not handed. It is handed exactly
// what the window's own lookup would act on in browser mode, asked of that same lookup: the global
// keys and the browser screen's. The browser mode key passes through to the page, as every mode key
// does in its own mode (keys-rule-1). Null is the page's key.
export function leavingKey(input: PageKey, keys: Settings['keys']): KeyInput | null {
  if (input.type !== 'keyDown') return null;
  const key: KeyInput = {
    key: input.key, code: input.code, shiftKey: input.shift, ctrlKey: input.control, altKey: input.alt, metaKey: input.meta,
  };
  return mapShortcut(key, keys, 'browser') === null ? null : key;
}
