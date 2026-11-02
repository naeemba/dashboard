# Settings

One file, one table, one screen: `settings.json` beside the `.env` main reads,
holding the key bindings, font size and shell, and edited from the settings
screen where a row is armed and the next keystroke becomes its key.

## On screen

What each screen does, in full. The help dialog keeps only a short
blurb for it; this is where the rest lives.

### Settings, host and worktree list

There is a second way to find a key, for when you know you are reaching for one
and not which. Hold Ctrl, Cmd or Alt without pressing anything else and a panel
near the bottom names every key that modifier can still start on the screen you
are on, each row saying what is left to press. Add a second modifier and the
list narrows to what that one reaches; let it go and the list widens again.
Press the key and it does the thing, as though the panel had never been there.
Shift on its own does not open it — Shift is how you write a capital.

Every key the settings screen lists can be changed, and so can the colours, the
font, the shell and the place the manager's weather is for. They are kept in
~/.config/dashboard/settings.json, which you can also edit by hand. It holds
only what you changed; anything you left alone follows the app's default,
including when that default moves. The app tidies the file each time it starts,
so a line you write that already matches the default is taken out again. Delete
it and everything is back to how it shipped.

The Host rows make this Dashboard reachable from another: a port, read at the
next launch, and the token the other machine pastes once. The port opens on
127.0.0.1 only, so the other machine reaches it through an SSH tunnel (ssh -L
7777:127.0.0.1:7777 host) and connects to 127.0.0.1:7777. To open it to the
network instead, write "bind" under "host" in settings.json — 0.0.0.0 for every
interface, or one address such as a Tailscale one; the wire is not encrypted,
and the token is the only thing between that network and your shells. Reset
everything to defaults keeps that token and the host this window last connected
to. The laptop must not sleep on lid close; that is the operating system's
setting.

The worktree list — its key is on this page — holds every card that has been
shipped, its branch, how old the worktree is, whether it has uncommitted
changes, and which pane its agent is in — no pane if every pane was already
taken when it shipped, or if the app has restarted since, because no shell
outlives it. Enter on a row goes to that pane; a row with no pane, and one whose
project has been closed since it shipped, say so rather than doing nothing. A
row leaves the list on its own only when its worktree has gone — removed in a
pane, or deleted by hand; nothing is ever removed for you. d removes one, asking
twice — the second question names the files if the worktree is dirty, and says
why git refused if it refused for some other reason. The folder and everything
in it goes, gitignored files included, and the pane its agent was in goes back
to being a plain shell in the project. The branch is left behind on purpose —
the pull request it came from may still be open.

## Files

Folders: `src/main/settings/`, `src/shared/settings/`, `src/renderer/settings/`.

- `settings.ts`, `settings-store.ts`, `settings-rows.ts`, `settings-view.ts`

## Scenarios

- Given a row is armed, when you press a key with modifiers, then that keystroke becomes the binding.
- Given a setting left at its shipped default, when the file is saved, then the line is left out.
- Given an old file holding a shipped default, when the app launches, then the launch tidy removes the line.
- Given a font size the screen accepts, when the file is read back, then the same range check keeps it (errors-decision-1).
