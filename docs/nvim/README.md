# Nvim

Each project's editor view, an nvim the app talks to over its socket. A pane's
scrollback, the Claude screen's prompt box and any file path a pane printed open
in it.

## On screen

What each screen does, in full. The help dialog keeps only a short
blurb for it; this is where the rest lives.

One nvim filling the window. It starts the first time you press the nvim key for
this project, not at launch. Quit it and the pane says it exited; Enter starts
it again, and so does coming back to this screen — the scrollback key needs a
running nvim to hand a file to. The status bar names the file nvim has open, and
just says nvim while nothing is open.

The scrollback key on the terminals screen sends the pane you are looking at
here as a file in a new tab, so an agent transcript can be searched and yanked
with real editor tools. It arrives whatever you were editing, unsaved changes
and all, and it is a copy: editing it changes nothing in the pane it came from,
and pressing the key again on that pane throws your edits away for a fresh copy.
Each pane gets a tab of its own, so two of them can be read side by side.

## Files

Folders: `src/main/nvim/`, `src/renderer/nvim/`.

- `nvim-remote.ts`, `file-links.ts`, `file-hints.ts`, `file-link-open.ts`,
  `file-open.ts`

## Scenarios

- Given a pane printed `src/main/main.ts:42`, when you click it, then the project's nvim opens the file at line 42 in the window you were editing in.
- Given a pane has paths on screen, when you press Alt+O, then a letter sits over each and one keystroke opens it.
- Given a pane's shell has `cd`'d into a worktree, when you open a relative path it printed, then the worktree's copy opens.
- Given the focused pane, when you press Ctrl+`, then its scrollback opens in nvim in a tab of its own.
- Given text in the Claude screen's box, when you press Ctrl+G, then it opens in nvim in a tab of its own, and once you save it and come back, the box holds what you saved; `:wq` closes the tab and leaves the file you were editing in front.

## Known limits

- What reads as a path is decided without the disk, so `and/or` underlines
  too (nvim-decision-1).
