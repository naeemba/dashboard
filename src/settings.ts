import { ACTIONS, actionByName, defaultBinding, type ActionEntry } from './actions';
import { formatBinding, parseBinding } from './binding';
import { THEME } from './theme';

// Everything the settings file holds. `keys` always has an entry for every action after parsing, so
// nothing downstream has to tell "unbound" apart from "not written down yet" — null is the first,
// and the second cannot happen.
export type Settings = {
  // Empty means "work it out": SHELL_COMMAND, then SHELL, then the platform default. A non-empty
  // value wins over both environment variables.
  shellCommand: string;
  font: { name: string; size: number };
  theme: Record<string, string>;
  keys: Record<string, string | null>;
};

export const DEFAULT_FONT = { name: 'JetBrains Mono', size: 13 };

// The colours the theme has. A file naming one that is not here is ignored rather than added: xterm
// would not read it, and a settings screen row for it would edit nothing.
const THEME_COLORS = Object.keys(THEME);

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR.test(value);
}

// The same range parseSettings holds a stored size to. Exported because the settings screen prints the
// message: one place decides the refusal and another shows it, so they must not each hold their own idea
// of what is allowed.
export function isFontSize(value: string): boolean {
  const size = Number(value);
  return value.trim() !== '' && Number.isFinite(size) && size >= 6 && size <= 72;
}

export function defaultSettings(isMac: boolean): Settings {
  return {
    shellCommand: '',
    font: { ...DEFAULT_FONT },
    theme: Object.fromEntries(THEME_COLORS.map((name) => [name, String(THEME[name as keyof typeof THEME])])),
    keys: Object.fromEntries(ACTIONS.map((entry) => [entry.name, defaultBinding(entry, isMac)])),
  };
}

// A binding written by hand is tidied on the way in, so `shift+ctrl+j` is stored and shown as
// `Ctrl+Shift+J` and the file, the screen and the help dialog all spell it the same way. A string that
// cannot be read is a typo: it costs that one shortcut, which goes back to its default.
function toBinding(stored: unknown, entry: ActionEntry, isMac: boolean): string | null {
  // Explicit null is the user saying "no key at all". Missing is the user saying nothing.
  if (stored === null) return null;
  if (typeof stored !== 'string') return defaultBinding(entry, isMac);
  const parsed = parseBinding(stored);
  return parsed === null ? defaultBinding(entry, isMac) : formatBinding(parsed);
}

export function parseSettings(stored: unknown, isMac: boolean): Settings {
  const defaults = defaultSettings(isMac);
  // Destructuring anything that is not an object gives undefined fields, and every check below already
  // rejects undefined, so the only shape worth guarding against is the one that would throw.
  const raw = (typeof stored === 'object' && stored !== null && !Array.isArray(stored))
    ? stored as Record<string, unknown>
    : {};
  const storedKeys = (typeof raw.keys === 'object' && raw.keys !== null)
    ? raw.keys as Record<string, unknown>
    : {};
  const storedTheme = (typeof raw.theme === 'object' && raw.theme !== null)
    ? raw.theme as Record<string, unknown>
    : {};
  const storedFont = (typeof raw.font === 'object' && raw.font !== null)
    ? raw.font as Record<string, unknown>
    : {};
  return withoutDuplicates({
    shellCommand: typeof raw.shellCommand === 'string' ? raw.shellCommand : '',
    font: {
      name: typeof storedFont.name === 'string' && storedFont.name.trim() !== ''
        ? storedFont.name : defaults.font.name,
      // A size outside this range gives you a window of unreadable panes and no way to see the screen
      // that would fix it.
      size: typeof storedFont.size === 'number' && isFontSize(String(storedFont.size))
        ? storedFont.size : defaults.font.size,
    },
    theme: Object.fromEntries(THEME_COLORS.map((name) => [
      name, isHexColor(storedTheme[name]) ? storedTheme[name] : defaults.theme[name],
    ])),
    keys: Object.fromEntries(ACTIONS.map((entry) => [
      entry.name,
      Object.hasOwn(storedKeys, entry.name)
        ? toBinding(storedKeys[entry.name], entry, isMac)
        : defaults.keys[entry.name],
    ])),
  });
}

// A hand-edited file can give two clashing actions the same key; the settings screen never can, because
// bindKey displaces whoever held it. mapShortcut answers with the first match, so the later action would
// silently never fire while the screen and the help dialog both printed its key. It loses the key here
// instead and shows as unbound — a state the screen could have produced itself.
function withoutDuplicates(settings: Settings): Settings {
  const keys: Settings['keys'] = {};
  // The same predicate the screen refuses with, asked against the rows decided so far: nothing later
  // is in `keys` yet, so it answers "who already holds this key" rather than "who else has it".
  const sofar: Settings = { ...settings, keys };
  for (const entry of ACTIONS) {
    const binding = settings.keys[entry.name];
    keys[entry.name] = binding !== null && holderOfBinding(sofar, entry.name, binding) !== null
      ? null : binding;
  }
  return sofar;
}

// Two actions clash when they hear the same key on the same screen. A global action is heard on every
// screen, so it clashes with everything; two screen-scoped actions on different screens never meet,
// which is what lets the board keep a bare D while a terminal keeps its own.
function scopesOverlap(one: ActionEntry, other: ActionEntry): boolean {
  return one.scope === other.scope || one.scope === 'global' || other.scope === 'global';
}

// Exported because the settings screen prints the message and this decides the refusal. Keeping the two
// apart is how you end up with a dialog naming an action that is not the one in the way.
export function holderOfBinding(settings: Settings, name: string, binding: string): string | null {
  const asking = actionByName(name);
  if (asking === undefined) return null;
  for (const entry of ACTIONS) {
    if (entry.name === name) continue;
    if (settings.keys[entry.name] !== binding) continue;
    if (scopesOverlap(asking, entry)) return entry.name;
  }
  return null;
}

// The key moves. Whoever held it is left unbound rather than sharing it — two actions on one key means
// one of them silently never fires, and there would be no message saying which.
export function bindKey(settings: Settings, name: string, binding: string | null): Settings {
  const displaced = binding === null ? null : holderOfBinding(settings, name, binding);
  const keys = { ...settings.keys, [name]: binding };
  if (displaced !== null) keys[displaced] = null;
  return { ...settings, keys };
}

export function resetKeys(settings: Settings, isMac: boolean): Settings {
  return { ...settings, keys: defaultSettings(isMac).keys };
}
