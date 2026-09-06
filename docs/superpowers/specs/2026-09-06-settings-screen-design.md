# Settings: one file, one table, one screen

Nothing in this app is configurable. The shell comes from an environment
variable, the colours are a constant in `theme.ts`, and every keyboard shortcut
is written out by hand in three places at once — the handler that fires it, the
help dialog that describes it, and the rules in `CLAUDE.md` that keep those two
honest.

This adds a settings file the user can edit by hand, a screen that edits the
same file from the keyboard, and one table of actions that the handler, the help
dialog and the screen all read from. After this, adding a shortcut means adding
a row.

## Scope

- `~/.config/dashboard/settings.json` holds the shell command, the theme, the
  font, and every key binding. Missing file, missing field or bad value all fall
  back to the built-in default.
- One table names every action once: what it does, which screens it fires on,
  and the key it ships with. `shortcuts.ts` matches against it, `help.ts` prints
  from it, the settings screen edits it.
- `Ctrl+,` opens the screen as an overlay, on the same dark sheet as the help
  dialog and the project picker.
- Every action's key can be changed, unbound, or reset. There are no
  restrictions on what a key may be.
- Colours and the font are edited as text, one row each.
- Reset to defaults, for everything or for the keys alone.

Not in scope: the keys inside dialogs — the picker's arrows, the card detail
screen, the confirm box. Those are not shortcuts competing with anything. The
dialog has focus, so nothing else can hear them, and there is no conflict to
resolve. Also not in scope: named theme presets, per-project settings, and
importing a theme from another terminal.

## The file

    {
      "shellCommand": "",
      "font": { "name": "JetBrains Mono", "size": 13 },
      "theme": { "background": "#282c34", "red": "#cc6666" },
      "keys": {
        "project-jump-1": "Ctrl+1",
        "project-next": "Cmd+]",
        "terminal-move-left": "Alt+H",
        "board-delete": "d",
        "help": null
      }
    }

It sits beside the `.env` file the main process already reads, at
`$XDG_CONFIG_HOME/dashboard/settings.json`, falling back to
`~/.config/dashboard/settings.json`. Not the Electron `userData` directory: that
is `~/Library/Application Support/Dashboard` on macOS, and the whole point of
this file is that a person opens it in an editor.

Every field is optional. Delete the file, or empty it to `{}`, and everything is
back to how it shipped. Delete one key from `keys` and that one shortcut is
back. That is the reset path that needs no UI.

`shellCommand: ""` means "work it out", which is what happens today:
`SHELL_COMMAND`, then `SHELL`, then the platform default. A non-empty value wins
over both environment variables.

A value that cannot be read is dropped on its own. A colour that is not a hex
string, a font size that is not a number, a binding that does not parse — each
falls back to its own default and the rest of the file is still used. This is
how `parseSession` already treats `session.json`, and for the same reason: a
typo should cost you one setting, not all of them.

## Bindings are strings

A binding is written the way a person writes a shortcut: `Ctrl+Shift+K`,
`Alt+H`, `Cmd+]`, `d`, `Left`. `null` means the action has no key at all.

Modifiers are `Ctrl+`, `Cmd+`, `Alt+` and `Shift+`, in that order when there is
more than one. The key itself is one of:

- a letter, `A` to `Z`
- a digit, `0` to `9`
- one of the punctuation keys: ``[ ] , . / ; ' - = ` ``
- a name: `Left` `Right` `Up` `Down` `Tab` `Enter` `Escape` `Backspace` `Space`

One function parses a string into a keystroke, one formats a keystroke back into
a string. The formatter is what draws the key in the help dialog and in the
settings screen, so the file, the screen and the help all spell a key the same
way. Parsing is case-insensitive; formatting always writes the canonical form,
so hand-edited `ctrl+k` becomes `Ctrl+K` the next time the file is written.

### It matches the physical key, not the character

A binding names the key under your finger — `event.code` — not the character the
keyboard produced.

`event.key` lies twice. Hold Option on macOS and `h` arrives as `˙`. Hold Shift
and `1` arrives as `!`. Today's code already works around both by reading `code`
for the digits and for Option+HJKL, with a comment at each site explaining why.
Making it the single rule removes the special cases and makes capture honest:
press the key you want, get that key.

What it costs: `Ctrl+]` today reads `key`, so on Dvorak it follows the `]`
character to wherever Dvorak puts it. Matching on `code` puts the shipped
default on the physical `]` key, which on Dvorak types `+`. The fix is to rebind
it, which is the feature being built. No one using this app types Dvorak, so
this is a footnote.

## The action table

`src/actions.ts`. Every action appears exactly once, with four things:

    export type ActionScope = 'global' | 'terminals' | 'board';

    export type ActionEntry = {
      // Stable. It is the key in settings.json, so renaming one loses a binding.
      name: ActionName;
      // The sentence the help dialog prints. Written for someone who has not been told.
      description: string;
      // Which screens it fires on. 'global' means every one, including while a shell
      // has the keyboard.
      scope: ActionScope;
      // What it ships with, per platform. null means it ships unbound.
      defaultKey: { mac: string | null; other: string | null };
    };

Roughly 59 entries:

**Global** — the project picker, back to the last project, help, settings, the
three mode keys, next and previous project, jump to project 1–9, move this
project to position 1–9.

**Terminals** — focus terminal 1–5, next and previous terminal, move to the pane
left/down/up/right, clear the shell's current line.

**Board** — move the selection up/down/left/right, move the card
up/down/left/right, attach, detach, edit title, edit description, open the card,
add, delete, cycle priority, sort, undo.

Two of these ship unbound off macOS and say so in the table rather than in a
branch: focus terminal 1–5, because `Ctrl+1`–`9` already belongs to the
projects there and there is no modifier left; and clear the shell's line, which
only stands in for something macOS does differently.

The file is a flat list of rows. It is data, so its length is not a design
smell, and the file-size rule already exempts that shape.

## Matching

`mapShortcut` stops being a stack of hand-written branches and becomes a lookup:
given the pressed keystroke, the current mode, and the bindings, find the action
whose binding matches and whose scope covers this mode. `terminals` actions only
fire in terminals mode, `board` actions only on the board, `global` actions
everywhere.

Two rules survive unchanged, because they are about meaning rather than about
which branch runs first:

- **The mode key you are already in does nothing.** `Ctrl+N` in nvim mode is
  nvim's autocomplete, `Ctrl+T` in terminals mode is the shell's transpose. You
  leave a mode by naming a different one. This is checked after the lookup finds
  a `mode-set` action, so it holds whatever key the mode has been bound to.
- **`isModified` still guards every dialog.** A dialog has focus, so no pane can
  receive the keystroke anyway, and a modified key inside one must do nothing.
  Rebindable shortcuts do not change that; the settings screen's own capture
  state is the single deliberate exception, and it is the point of that state.

The board's keys move out of the switch in `board-view.ts` and into the same
lookup. That switch is what makes the board's twelve keys a third hand-written
copy today.

## The screen

An overlay, built on `openOverlay` like the help dialog and the picker. It opens
from every mode and closes back to where you were. It is not a fourth mode: the
three modes are per-project and each page remembers its own, so a settings mode
would mean one copy per project page of a screen that has one set of values.

Arrows walk every row, top to bottom, and the list scrolls. Three groups:

**Keys** — one row per action: what it does, and the key it has. `Enter` arms
the row and the very next keystroke becomes its binding. `x` unbinds it.

The armed row swallows everything, including `Escape` and `Ctrl+,`, because
otherwise those two keys are the only ones you can never bind. There is no
cancel: arming is one keystroke long, and the way out of a binding you did not
mean is to bind it again.

If another action already holds the key you pressed, a confirmation says which
one. `Enter` takes the key and leaves the other action unbound; `Escape` cancels
and nothing changes.

**Theme** — one row per colour, 21 of them, each showing a swatch and its hex.
`Enter` opens a small text box, you type `#cc6666`, `Escape` commits — the same
edit gesture the board already uses for a card title. A value that is not a hex
colour is refused, and the message says so. Two more rows for the font name and
size. A font name that is not installed is not something the app can check;
xterm falls back and the pane still draws.

**Shell** — one row, edited as text. Empty means "work it out from the
environment".

**Reset** — two rows at the bottom. *Reset every key to its default* and *Reset
everything to defaults*. These matter more here than they would elsewhere: there
are no restrictions on what a key may be, so binding a bare `a` to a global
action is allowed, and it will swallow `a` in every shell on every page. If you
bind over the settings key itself, the screen is out of reach and the file is
the way back — which is why the file is somewhere a person can find it.

Every one of these is reachable from the keyboard alone. Nothing on the screen
needs a click.

## When a change takes effect

| Change | When |
|---|---|
| Any key | Immediately |
| Colours, font name, font size | Immediately, in every pane on every page |
| The window background behind the panes | Next launch |
| Shell command | Panes started after the change |

The window background is painted by the main process before the renderer exists,
so that one frame keeps the old colour until you restart. Every pane's own
background updates at once, so this is only visible in the margins.

Running shells keep the shell they started with. Nothing here kills a pane —
there are long-running jobs in them, and a settings change is not a reason to
lose one.

## One thing gets deleted

`SHELL_COMMAND_FLAG` passes the resolved shell to the renderer as a launch
argument, and the renderer uses it to decide how to quote a dropped path —
PowerShell doubles a quote, a POSIX shell escapes it, and each reads the other's
form as garbage.

Once the shell is editable, that copy goes stale the moment you change it: drop
a path with a space in it and it is quoted for the shell you used to have. So
the resolved shell comes back with the settings instead, and the launch argument
and its flag go away.

## Files

New:

- `src/settings.ts` — the shape, the defaults, and parsing an unknown value into
  a `Settings`. Pure, like `session.ts`.
- `src/actions.ts` — the table.
- `src/binding.ts` — parse a binding string, format a keystroke, match a
  keystroke against a binding.
- `src/settings-store.ts` — read and write the file in the main process.
- `src/settings-view.ts` — the overlay and the row list.

Changed:

- `src/shortcuts.ts` — `mapShortcut` becomes a lookup over the table.
- `src/help.ts` — `BOARD_SHORTCUTS`, `terminalShortcuts` and the projects list
  are deleted; the rows are built from the table and the current bindings. The
  blurbs stay, and gain one for the settings screen.
- `src/board-view.ts` — its key switch routes through the lookup.
- `src/renderer.ts` — applies the theme and font on load and on change; opens
  the settings overlay.
- `src/main.ts` — reads the settings file at startup, resolves the shell from
  it, serves it over IPC, writes it back.
- `src/bridge.ts`, `src/preload.ts` — the settings IPC; `shellCommand` moves out
  of the launch argument.
- `src/shell.ts` — `SHELL_COMMAND_FLAG` removed; `pickShell` gains the settings
  value ahead of the environment.
- `src/theme.ts` — `THEME` becomes the default theme rather than the theme.
- `CLAUDE.md` — two hard rules change. The one about keeping the help dialog's
  hand-written rows in step with the handler is no longer true for the keys,
  though the rule about the blurbs still is. And the one saying every keydown
  handler reaches `isModified` before it acts gains its named exception: the
  armed row in the settings screen, which must read a modified key because
  reading it is the whole job. Named there, not left for someone to find.

## Testing

The parts worth testing are all pure, and all of them are the parts that break
quietly:

- `binding.ts` — a string round-trips through parse and format. `ctrl+k` and
  `Ctrl+K` parse the same. A keystroke with Option held matches `Alt+H` even
  though the browser reported the key as `˙`. Shift and a digit match `Shift+1`,
  not `Shift+!`. Rubbish does not parse.
- `settings.ts` — an empty object gives the defaults. One bad colour costs one
  colour. A binding that does not parse costs one binding. `null` means unbound
  and is not confused with missing.
- `shortcuts.ts` — a keystroke finds its action; a `terminals` action does not
  fire on the board; the mode key you are already in returns nothing whatever it
  is bound to; an unbound action never fires.
- Conflicts — binding a key another action holds is detected, and the detector
  is the same function the screen shows the message from.
- `help.ts` — the rows follow the bindings, so rebinding a key changes what the
  help dialog says.

The two view files stay thin enough that the logic they hold is in the pure
files above.
