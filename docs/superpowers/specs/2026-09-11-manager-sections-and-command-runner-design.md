# Manager sections, and running a command across projects

The manager page grows a named strip along the top, and a third screen behind
it: type a command once, run it in the projects you mark, read the answers one
row per project.

Two things are being built here, and the first exists because of the second.
The command screen has nowhere to live. The manager holds two views today and
you move between them with a key you have to already know — Ctrl+B to the
board, Escape back. A third view reached by a fourth hidden key is how a screen
gets built that nobody finds. So the views get names on screen first.

## The strip

```
  general    board    command
  ───────
```

Three names along the top of the manager page, the current one underlined.
Nothing else on the page moves; the strip sits above whichever view is showing.

`Alt+H` and `Alt+L` walk it, on every section including the board. Left and
Right do not walk it: on the board they move between cards, and a pair of keys
that works on two screens out of three is worse than one pair that always
works.

A click on a name goes to that section — the click does what the key does, as
every list in this app already does.

The strip is the manager's. A project page has the tab strip and the mode keys
and gains nothing from this.

## The command screen

```
  general    board    command
                      ───────

  Command  ┃ npm audit                                          ┃

  ▣ api     ~/workspace/api      exit 1 · 3 high, 0 moderate
  ▣ web     ~/workspace/web      running
  ▢ infra   ~/workspace/infra    —

  Enter runs it · Space marks a project · Escape cancels
```

Up and Down walk the command box and the project rows as one list. `Space` on
a project row marks or unmarks it; every project starts marked, so a command
typed and Enter pressed runs everywhere, which is the common case. `Enter` in
the command box runs it in the marked projects. `Enter` on a project row that
has finished opens its last five lines underneath, and shuts them again.
`Escape` cancels a run.

No key on this screen is forwarded to a pane, so Space and Enter cost nothing
here. That is the whole reason the marks live on this screen and not on the
general list, where a bare Space is a Space that can no longer answer a waiting
shell.

The command box carries `dir="auto"`, like every other box in this app.

The command is not saved. It survives while the app is running, so running the
same thing again is two keystrokes, and it is gone on restart. The card asks
for named tasks in settings.json; that is a follow-up, and the note under
"Not doing" says why it is not here.

### What a row says

| State | The row |
|---|---|
| Never run | `—` |
| Running | `running` |
| Finished | `exit 1 · 3 high, 0 moderate severity vulnerabilities` |
| Cancelled | `cancelled` |
| Could not start | `exit 127 · command not found: npm` |

The text after the exit code is the last line of output with anything printable
in it, escape codes stripped. It is a guess and the screen does not pretend
otherwise: a command whose last act is to redraw a progress bar will show that
bar. Reading `npm audit` properly — three high, no moderate — means a parser
per tool, and every tool words it differently, so there is none.

Marks and results are the screen's own state. Nothing is written to disk and
nothing survives a restart: a run is a moment, not a record.

## Running it

Main spawns one process per marked project. Not a pty, and not one of the five
panes — a task that borrows a shell throws away whatever was in it.

The command runs through the user's shell with `-lic`, the same arguments the
editor and agent panes already use, and for the same reason spelled out above
`editorArguments` in `shell.ts`: an app launched from the Dock inherits almost
no PATH, so `npm` is not found unless the shell's own startup files have run.
`-l` is where Homebrew is and `-i` is where fnm, nvm and mise are, and a
command needs both.

`-i` without a terminal attached is the one thing here that is new. A shell
started interactive with no tty can complain on stderr about job control. That
noise goes into the captured output and can therefore be the last line. If it
turns out to be, the fix is to prefer the last line of stdout and fall back to
stderr only when stdout is empty — decided when it is seen, not guessed at now.

Three channels, named the way every channel in `preload.ts` is named:

- `task:run` — the command, and the project paths to run it in.
- `task:cancel` — kill whatever is still going.
- `task:update` — sent back per project, once when it starts and once when it
  finishes. Per project rather than one answer at the end, because a row that
  says `running` while the others have answered is the point of the screen.

Cancelling kills the process group, so a `npm audit` that has spawned a child
does not leave one behind.

A run replaces the previous run's results outright. There is no history.

## Keys, and the one change to how a key is heard

Two new rows in `src/actions.ts`, which is the only place a key is written
down:

| Name | Key | What it does |
|---|---|---|
| `section-previous` | `Alt+H` | The section to the left, on the manager |
| `section-next` | `Alt+L` | The section to the right, on the manager |

`Alt+H` and `Alt+L` are `terminal-move-left` and `terminal-move-right` today,
in terminals scope. The manager has no terminals, so nothing collides.

These two have to be heard on all three sections. An action names one scope,
and a scope is a mode, so as things stand this cannot be said: `manager`,
`board` and `command` are three modes. Two rows sharing one binding is not a
way out — the app treats a key held by two actions as a hand-edited settings
file and lets table order settle it.

So `ActionScope` gains one value, `manager-page`, meaning *any section of the
manager*. `hears` cannot answer it from the mode alone, because `board` is a
mode the manager shares with every project, so it takes one more argument:
whether this page is the manager. The renderer already knows — the manager is
the page holding `MANAGER_SLOT`, which is the one thing about it that never
changes.

That also means two scopes can now overlap without being equal, which the
settings screen has to know about: a key bound to a `manager-page` action and
to a `board` action really do collide, on the manager's board. `holderOfBinding`
asks a new `scopesOverlap` in `actions.ts` instead of comparing two strings, so
the rule lives in one place — the same reason `isFontSize` exists.

**Not in this change, but now possible.** CLAUDE.md records a known wart: the
three keys that belong only to the manager's board are board scope, so a
project's own board lists them in Ctrl+H and they do nothing there. They could
become `manager-page` scope and stop being listed. It is a small change and it
deletes a paragraph of CLAUDE.md, but it changes behaviour on a screen this
card is not about, so it gets its own card.

## A fourth mode

`command` joins `terminals`, `nvim`, `board` and `manager` in `MODES`. It has
no mode key — you reach it from the strip, which is the point of the strip —
and it needs a name in `MODE_NAMES`, a blurb in `BLURBS`, a line in
`modeLabel`, and a branch in `focusMode`.

That cost was named and refused once before: the notes on the shipped manager
board card say a mode of its own was "the only way out" of the listed-but-dead
keys and "costs more in MODES, MODE_NAMES, BLURBS, modeLabel and focusMode for
the same screen". It was not worth it to fix three help rows. It is worth it
for a screen that has to exist, and the strip is what it buys.

`session.ts` throws away a saved mode that is not a project's, so nothing has
to be taught to keep `command` out of the session file.

## Files

New:

| File | What it holds |
|---|---|
| `manager-sections.ts` | The three sections, the mode each one shows, and where Alt+H and Alt+L land. Pure. |
| `manager-sections.test.ts` | |
| `tasks.ts` | A result, the last printable line of raw output, and the sentence a row prints. Pure. |
| `tasks.test.ts` | |
| `command-view.ts` | The command screen: the box, the marks, the rows, the keys. |

Changed:

| File | Why |
|---|---|
| `actions.ts` | Two rows, the new scope, `scopesOverlap` |
| `shortcuts.ts` | `hears` takes the manager-page flag |
| `settings.ts` | `holderOfBinding` asks `scopesOverlap` |
| `modes.ts` | `command` |
| `manager-view.ts` | The strip |
| `renderer.ts` | Build the strip and the command view into the manager page; pass the flag to `mapShortcut` |
| `status.ts` | What the status bar says on the command screen |
| `main.ts` | Spawn, collect, cancel |
| `bridge.ts`, `preload.ts` | Three channels |
| `help.ts` | The command blurb, and the manager blurb now describes a strip |
| `index.css` | The strip and the screen |

`renderer.ts` is 817 lines and must not grow much. The strip is drawn by
`manager-view.ts` and the screen by `command-view.ts`; what the renderer gains
is the wiring to build them and the one flag it passes to `mapShortcut`.

## What is tested

`manager-sections.ts` and `tasks.ts` are plain functions with a test file each,
which is where the branches are: where Alt+H lands on the first section, what
the summary says for each state, what the last line of a chunk of output with
escape codes in it is.

`shortcuts.test.ts` already drives every screen-scoped key from its own scope
and gains the manager-page rows. `settings.test.ts` gains a clash between a
`manager-page` key and a `board` key, which is the case `scopesOverlap` exists
for.

The spawning in `main.ts` is not tested, for the reason CLAUDE.md already
gives about the main-process handlers: what could break there is Electron's and
node's plumbing, and a test for it is a test of mocks.

Three checks must pass before the pull request: `npm test`, `npx tsc --noEmit`,
`npx eslint .`.

## Not doing

**Named tasks in settings.json.** The card asks for a task to be a name and a
command. It is a box you type in instead, because you said the command is
yours to get right, and because a saved list needs a settings screen row, a
picker over the names, and a decision about what ships as a default. If
retyping `npm audit` each week grates, that is a card, and the screen it
attaches to will already exist.

**Results that survive a restart.** A run answers a question you are asking
now.

**A history of runs.** Same reason.

**Sending a command to the panes.** That is a different card, and it must stay
different: this one exists partly so that asking five projects a question never
touches a shell you were using.
