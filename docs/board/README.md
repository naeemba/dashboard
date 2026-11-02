# Board

A project's kanban board under Ctrl+B, kept in `.dashboard/board.json`: cards
with priority, notes, subtasks, a comment trail, a branch and a pull request,
in Backlog, Todo, Ship, Doing, Review and Done. The `board` command writes the
same file, so an agent can work its own card.

## Files

Folders: `src/main/board/`, `src/shared/board/`, `src/renderer/board/`.

- Model and file: `board.ts`, `board-store.ts`, `board-watch.ts`,
  `board-writes.ts`, `board-changes.ts`, `card-moves.ts`
- The `board` command: `board-cli.ts`, `board-cli-entry.ts`, `board-program.ts`,
  `board-usage.ts` (also `dashboard board`, see [command](../command/README.md))
- Screen: `board-view.ts`, `board-detail.ts`, `board-toolbar.ts`,
  `board-state.ts`, `board-drag.ts`, `drop-marker.ts`, `card-aim.ts`
- Narrowing: `board-filter.ts`, `filter-dialog.ts`, `card-search.ts`
- Styles: `board.css`
- Tests: `test-board.ts` (helpers), `board.test.ts`, `board.columns.test.ts`,
  `board.tree.test.ts`

## Scenarios

- Given the board is on screen, when `board move` writes the file from a pane, then the board re-reads without moving your selection.
- Given a card with subtasks, when you blank its title, then it is refused and the status bar says to delete it with `d`.
- Given you deleted a card, when you undo, then it comes back where it was.
- Given the board's first read failed, when you press a key, then the board refuses it instead of writing over the file.
- Given a card's pull request is open, when its agent finishes, then the card goes in Review, not Done.
- Given a filter keeps a card only because you just changed it, when an arrow moves the selection off it, then the board redraws and the card is gone; an arrow that leaves the drawn cards as they are and lands on one of them only moves the highlight.
