# Manager

The first tab, which is not a project: every open project in one list with
what wants you, a queue to the next thing, a board of every open project, a
command run across projects, its own board and notes, its own terminals, the
worktree list, the log, and the build version along its foot.

## On screen

What each screen does, in full. The help dialog keeps only a short
blurb for it; this is where the rest lives.

The first tab, and the only page that is not a project: no folder and no shells,
so the terminal and nvim keys do nothing here. It is where the window lands when
nothing was open last time. Five sections are named along the top — general,
board, command, notes, log — and the board and notes keys still come straight
here to those two.

Above those names is a row of four cards for looking at only — no key reaches
them: today in the Persian and the Gregorian calendar with the weather for the
place set in settings, then Bitcoin and gold in dollars and Tether in toman,
each with how far it moved over a day, a week, a month and a year. Gold is PAX
Gold, a token that tracks an ounce of spot gold closely but not exactly. They
are read when the app starts and every half hour after; a source that fails
keeps its last numbers and says why underneath.

At the top, Needs you is everything across the open projects that is waiting on
you, the longest-waiting first: a pane asking a question, a pane that has died,
an agent working a card whose pane has printed nothing for half an hour, a card
in Review that no pane here is reviewing, and a Done card whose worktree git
would not remove because it holds uncommitted work. Enter on one goes there —
the pane, or the card on its project's board — and the remove key works on the
last kind. Typing a character on a question answers it, as it does on the pane's
own row. The next-thing key goes to the oldest of them from any page, and each
press after goes on to the next one, skipping any it cannot land on.

Under it the list shows every open project and what its panes want from you —
one asking a question, one that has died and needs starting again. Enter on a
project shows all of its panes by name. The ones asking and the ones that have
died carry the last few lines they printed, so the question or what it died of
can be read from here; the rest carry the one line they last printed. Every pane
says how long ago it printed, which is how you spot the one that has been quiet
since this morning. A pane that wants nothing shows no status at all; a project
none of whose panes wants anything says nothing waiting. The terminals and the
worktrees under a project each have their column names above them.

Every project also carries three token figures at the end of its row, each with
its name: the last five hours, this week counting from Monday, and all time. A
pane running a Claude Code agent carries what that agent has cost, in its Tokens
column. They are read out of Claude Code's own logs on this machine and refresh
every half minute. The first reading after a launch goes through every log there
is, so with years of them the figures can take twenty seconds to appear; the
panes and typing do not wait for it. The four figures along the top add every
open project up — the three windows, the week as one bar a day with its letter
under it, and how many worktrees are out, how many of those hold uncommitted
work, and how many git could not answer for.

Beside each project's name is what its board holds, one pill per column, leaving
Done out. Under it, open or shut, is every worktree git knows of for that
project — the ones made for its cards first, then any made elsewhere, by an
agent session or by hand: the card or the folder, its branch, whether it is
clean or dirty, its size on disk (measured every few minutes; … while measuring,
? when it could not be), and for a card's worktree when it was started and the
pane it runs in. Enter on a card's worktree goes to that pane; the remove key or
its Remove button asks before removing it, and asks again if it holds work.
Beside the list, Recent activity is the cards changed last on every open board,
newest first.

The last line on the page is the version of the build you are running and the
commit it was built from, there to be held up against main: the same commit and
the copy you have installed has everything that has been merged.

Enter on a pane takes you straight there; a letter, digit or symbol is sent to
it instead, which answers a menu without leaving this page and takes the mark
off the pane. The highlight stays on it, so a second question from the same pane
is answered without picking it again. Only a pane that is asking takes a key
that way: a pane that has died wants Enter in the pane itself, and one getting
on with its work is left alone. A project with nothing to report says nothing
waiting beside its name, and still opens to show what its panes are up to.

The close key works from here too, and this is the one screen where it needs a
highlight: there is no project behind this page, so what it takes is the project
the selection is on. What it takes and what stops it are the same everywhere,
and the Projects section below says both.

### The manager's sections

The manager is five screens with one strip of names above them. Two of these
keys walk it, from any of the five. The arrows are deliberately not these keys:
on the board they move between cards, and in the notes they move the caret.
Above the strip, four cards show the date and weather, Bitcoin, Tether in toman
and gold, each read again every half hour. The refresh key reads all four now;
the round arrow in a card's corner, clicked or reached with Tab and pressed with
Enter, reads that card alone. It spins while the read runs, and a card keeps its
last good numbers on screen until the new ones land.

## Files

Folders: `src/main/manager/`, `src/shared/manager/`, `src/renderer/manager/`.

- Page: `manager.ts`, `manager-page.ts`, `manager-view.ts`,
  `manager-panels.ts`, `manager-reads.ts`, `manager-sections.ts`,
  `section-strip.ts`, `manager.css`
- What wants you: `needs-you.ts`, `board-summary.ts`
- Boards of every project: `cards.ts`, `cards-view.ts`
- Command across projects: `command-view.ts`, `tasks.ts`, `task-runner.ts`
- Log section: `log-view.ts`
- Terminals: `manager-terminals.ts` (main's half; the view is the panes
  feature's `page.ts`)

## Scenarios

- Given a pane is waiting, when you press Enter on its row, then you land on that pane in its project.
- Given several things need you, when you press the next-in-queue key, then you are taken to the next one.
- Given the manager's board, when you move a card in a project's board there, then that project's `board.json` changes.
- Given projects are marked, when you run a command, then it runs in a free pane of each marked project.
- Given the manager page, when you look at its foot, then it shows the version from `package.json` and the commit it was built from.
- Given the manager page, when you press the terminals key, then its main session `main-manager` is on the left, working in `~/.dashboard` (made if missing), with its worker panes on the right.
- Given the manager's main, when it runs `session claim` and `session run`, then a worker opens on the manager page in `~/.dashboard` as `manager-terminal-<n>` and reports to `main-manager`.
- Given the manager's terminals, when you press a key that opens something in nvim (the scrollback, Ctrl+G, a path a pane printed), then the status bar says at once that the manager has no nvim.
- Given the manager's terminals on screen, when the window connects to another host or comes back home, then they are emptied and drawn again from that host: its `main-manager` conversation and its workers.

## Known limits

- The manager's workers do not come back after a restart; its main's
  conversation does (manager-decision-2).

- Ctrl+Q and three board-scope keys are listed on manager screens where they
  do nothing (keys-decision-1, keys-decision-2).
