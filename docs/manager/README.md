# Manager

The first tab, which is not a project: every open project in one list with
what wants you, a queue to the next thing, a board of every open project, a
command run across projects, its own board and notes, the worktree list, the
log, and the build version along its foot.

## Files

- Page: `manager.ts`, `manager-page.ts`, `manager-view.ts`,
  `manager-panels.ts`, `manager-reads.ts`, `manager-sections.ts`,
  `section-strip.ts`, `manager.css`
- What wants you: `needs-you.ts`, `board-summary.ts`
- Boards of every project: `cards.ts`, `cards-view.ts`
- Command across projects: `command-view.ts`, `tasks.ts`, `task-runner.ts`
- Log section: `log-view.ts`

## Scenarios

- Given a pane is waiting, when you press Enter on its row, then you land on that pane in its project.
- Given several things need you, when you press the next-in-queue key, then you are taken to the next one.
- Given the manager's board, when you move a card in a project's board there, then that project's `board.json` changes.
- Given projects are marked, when you run a command, then it runs in a free pane of each marked project.
- Given the manager page, when you look at its foot, then it shows the version from `package.json`.

## Known limits

- Ctrl+Q and three board-scope keys are listed on manager screens where they
  do nothing (keys-decision-1, keys-decision-2).
