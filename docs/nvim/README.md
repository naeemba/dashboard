# Nvim

Each project's editor view, an nvim the app talks to over its socket. A pane's
scrollback, the Claude screen's prompt box and any file path a pane printed open
in it.

## Files

- `nvim-remote.ts`, `file-links.ts`, `file-hints.ts`, `file-link-open.ts`,
  `file-open.ts`

## Scenarios

- Given a pane printed `src/main.ts:42`, when you click it, then the project's nvim opens the file at line 42 in the window you were editing in.
- Given a pane has paths on screen, when you press Alt+O, then a letter sits over each and one keystroke opens it.
- Given a pane's shell has `cd`'d into a worktree, when you open a relative path it printed, then the worktree's copy opens.
- Given the focused pane, when you press Ctrl+`, then its scrollback opens in nvim in a tab of its own.
- Given text in the Claude screen's box, when you press Ctrl+G, then it opens in nvim in a tab of its own, and once you save it and come back, the box holds what you saved; `:wq` closes the tab and leaves the file you were editing in front.

## Known limits

- What reads as a path is decided without the disk, so `and/or` underlines
  too (nvim-decision-1).
