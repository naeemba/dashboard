import { ACTIONS, actionByName, defaultBinding, scopesOverlap, type ActionEntry } from './actions';
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

// One line of the file's `keys`, read. `written` travels with the binding because the two answers come
// from the same look at the stored value; see toBinding.
type Binding = { binding: string | null; written: boolean };

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
// `written` says the file named a key here and named it readably — the only lines that outrank a default
// when two want the same key. It comes back from here rather than being worked out a second time
// elsewhere, because the second copy would be the same condition spelled again.
function toBinding(stored: unknown, entry: ActionEntry, isMac: boolean): Binding {
  // Explicit null is the user saying "no key at all". Missing is the user saying nothing. Neither names a
  // key, so neither can take one off anybody and the ordering never sees them.
  if (stored === null) return { binding: null, written: false };
  const parsed = typeof stored === 'string' ? parseBinding(stored) : null;
  if (parsed === null) return { binding: defaultBinding(entry, isMac), written: false };
  return { binding: formatBinding(parsed), written: true };
}

// A plain object, and nothing else. A list has string keys too, so Array.isArray has to be asked
// separately or `[1, 2]` reads as `{ "0": 1, "1": 2 }`.
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Anything that is not a plain object reads as one with nothing in it. Every check that follows a call
// to this already rejects undefined, so a file holding a number, a list or null where an object belongs
// falls through to the defaults instead of throwing.
function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

export function parseSettings(stored: unknown, isMac: boolean): Settings {
  const defaults = defaultSettings(isMac);
  const raw = asRecord(stored);
  const storedKeys = asRecord(raw.keys);
  const storedTheme = asRecord(raw.theme);
  const storedFont = asRecord(raw.font);
  // A line the file left out reads as undefined, which toBinding already answers with the shipped default.
  // A default is never `written`, so withoutDuplicates settles the written lines first and a key nobody
  // typed cannot take one off a line someone did.
  const bindings = ACTIONS.map((entry) => ({
    entry, ...toBinding(storedKeys[entry.name], entry, isMac),
  }));
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
    keys: Object.fromEntries(bindings.map(({ entry, binding }) => [entry.name, binding])),
  }, new Set(bindings.filter(({ written }) => written).map(({ entry }) => entry.name)));
}

// A hand-edited file can give two clashing actions the same key; the settings screen never can, because
// bindKey displaces whoever held it. mapShortcut answers with the first match, so the later action would
// silently never fire while the screen and the help dialog both printed its key. It loses the key here
// instead and shows as unbound — a state the screen could have produced itself.
// A binding the file names beats one it does not. Every action holds a binding by now — the file's where a
// line was written, the shipped default everywhere else — so settling them in table order would let a
// default nobody typed take the key off a line someone did, with the row order in ACTIONS deciding it.
// `written` names the lines the file spelled out. They are settled first, so a default can only lose.
function withoutDuplicates(settings: Settings, written: Set<string>): Settings {
  // Seeded in table order so the file this is written back to keeps its rows where a hand-editor left
  // them, whatever order the loop settles them in. An unsettled row reads as unbound, which is what makes
  // the predicate below answer "who already holds this key" rather than "who else has it".
  const keys: Settings['keys'] = Object.fromEntries(ACTIONS.map((entry) => [entry.name, null]));
  // The same predicate the screen refuses with, asked against the rows decided so far.
  const soFar: Settings = { ...settings, keys };
  const order = [...ACTIONS].sort(
    (one, other) => Number(written.has(other.name)) - Number(written.has(one.name)),
  );
  for (const entry of order) {
    const binding = settings.keys[entry.name];
    keys[entry.name] = binding !== null && holderOfBinding(soFar, entry.name, binding) !== null
      ? null : binding;
  }
  return soFar;
}

// Exported because the settings screen prints the message and this decides the refusal. Keeping the two
// apart is how you end up with a dialog naming an action that is not the one in the way.
export function holderOfBinding(settings: Settings, name: string, binding: string): string | null {
  const asking = actionByName(name);
  if (asking === undefined) return null;
  for (const entry of ACTIONS) {
    if (entry.name === name) continue;
    if (settings.keys[entry.name] !== binding) continue;
    if (!scopesOverlap(asking.scope, entry.scope)) continue;
    return entry.name;
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

// The chosen lines of one object: what is left of it once every entry equal to what this build ships is
// taken out.
// Every line it holds, whatever it is called. Naming the settings here instead would mean the next one
// added is copied in above and never compared, so this build's default for it is written into the file
// and frozen — the failure this whole function exists to stop, with every test green.
// A line is walked as a group only where the file itself holds an object there; anything else is a
// value, kept unless it matches the default. `"theme": "dark"` is somebody reaching for a feature that
// is not here — it is left as a value to be read, not replaced by an empty object. A group the file
// never named is not added either, or every launch dirties a settings.json kept in a dotfiles repo.
// Walking down is the same rule again rather than a second one, so a group that later grows a group of
// its own is thinned by the rule that already exists instead of falling through it.
function chosenFrom(
  mine: Record<string, unknown>, shipped: Record<string, unknown>,
): Record<string, unknown> {
  const chosen = { ...mine };
  for (const [name, value] of Object.entries(chosen)) {
    const theirs = shipped[name];
    if (isRecord(value) && isRecord(theirs)) chosen[name] = chosenFrom(value, theirs);
    else if (value === theirs) delete chosen[name];
  }
  return chosen;
}

// What belongs in the file: the lines somebody chose. Anything equal to what this build ships is left
// out, so the next build's default is read rather than this one's being frozen in.
// Without it, saving one font size writes every action's key and every theme colour as if you had
// picked them. A default we later have to move — the manager board's project keys went from Ctrl+Up to
// Cmd+Up because macOS takes Ctrl with an arrow for Mission Control — then never reaches anyone who has
// ever opened the settings screen, and their only way out is deleting the file, which takes their font
// and their colours with it.
// It is also what makes `written` mean anything: a file that named every action made every line written,
// so the written-first sort in withoutDuplicates settled nothing and ACTIONS row order quietly decided
// who lost a clashing key.
// An explicit null key stays. It says "no key at all", which is not what the default says, and
// parseSettings reads a missing line as the default rather than as unbound.
//
// Both writers come through here — the save, handed the settings it is storing, and the launch tidy,
// handed the file's own JSON — so the rule is written once. The tidy is why this takes lines out of
// what it was given rather than building a fresh object from what it recognises: parseSettings repairs
// what it cannot accept, and writing those repairs back deletes what you typed. You write "size": 130
// meaning 13.0, launch to find the panes unchanged, open the file to look for the typo, and the line
// is gone. Comparing the raw value instead, 130 is not 13, so it stays where you put it.
// Everything the file holds that this build has no opinion on is handed back untouched, a field it has
// never heard of included — on the launch tidy, which is the only path that ever sees one. A save
// writes what parseSettings read, and that never held the field.
export function withoutShipped(stored: unknown, isMac: boolean): unknown {
  // A file holding a list, a string or null parses fine and is none of our business. Rebuilding it as
  // an object would be the whole file thrown away for a mistake we could have let them read instead.
  if (!isRecord(stored)) return stored;
  const shipped: Record<string, unknown> = defaultSettings(isMac);
  return chosenFrom(stored, shipped);
}
