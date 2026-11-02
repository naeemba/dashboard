# Workers: decisions

Settled questions. Read the entry before re-litigating it.

## workers-decision-1: The main session and its workers

A project's terminals are its main session, full height on the left, and worker panes in a
scrolling list on the right, as many as have been opened. The card asked for this layout; four things it
said were changed on the way, each for a reason that is the card's own goal, and they come after the
two paragraphs on main.

**Main is the Claude screen, not a pane.** It began as Claude Code in pane 0; it is now the Agent SDK
session the Claude screen draws, started with the project in auto mode, named `main-<project>` and
given the dispatch prompt, as the pane was. The separate Claude view went with it: two Claude sessions
on one page was one too many. Its keys are heard on the terminals view while it has the keyboard, and
where one shares a key with a terminals key (Alt+O, Alt+N, Alt+J/K) the screen answers it. The first
launch after the change carries on the conversation the terminal main left, over one the old Claude
view remembered: the terminal one was the project's main, the one its workers report to. Pane 0 keeps
the number so a notification and the focus keys still name main; nothing is ever spawned in it.

Main is started again at once after a new conversation or a /resume, so a worker's report never
finds no main to arrive at. An end nobody asked for, a crash, is not restarted: a session that dies on
start would die again in a loop. The screen says it ended, and the next prompt starts it.

**The focus keys are not Ctrl+1..9.** Ctrl with a digit is the tab jump on every platform, and taking it
would cost every tab key to reach a pane. The nine focus rows are where the five were: Cmd with a digit
on a mac, and Alt with a digit elsewhere, which used to ship unbound. The first is main, the rest count
down the worker list by place, not by pane number, so the second key is always the top worker. Past
the eighth, Alt+J/K walk the list.

**Main is called `main-<project>`, not `main`.** Every open project has a main session, and a worker's
SendMessage to `main` with two of them open names two sessions. dispatch.ts spells it.

**The Stop hook goes through the app, not to main directly.** A hook is a shell command, and Claude
Code has no command that sends a message to a named session; the mailbox under `~/.claude/sessions` is
its own undocumented business. So the hook runs `session notify <id> done`: the pane gets a green edge,
`session list` says `done`, and for a pane main's worker is in, the app queues a short prompt into the
session of the main that dispatched it (the claimer's, for a pane claimed with `--project`): the
worker's name, its pane, and that its own report says what it did. It goes through the session's own
queue (chat-decision-7), so a main mid-turn reads it after the turn. That is the report main can count
on when a worker forgot to write or died before it could. The worker's own prompt still ends by telling
it to SendMessage main, since the hook knows nothing of what the worker did. A card's agent a ship
started and a Claude opened by hand never tell main: neither is main's worker.

**A throwaway worktree is not on the worktree record.** That record is per card, and a throwaway
worktree has no card. The manager's worktree list finds it through git like any other folder, and
release removes it only once `unfinishedWork` in finished-work.ts says its work is committed, pushed
and has a pull request. Kept otherwise, and the reply says why. Which pane held it lives in memory, so
a restart forgets it and it is left for the manager's list to remove.

**Release kills only main's worker, while it is still there.** main.ts keeps one record of the panes
holding main's worker now: a session run adds the pane, and the agent exiting, anything else started in
the pane, or the pane closing takes it out. session.json marks those panes `dispatched`, so after a
restart they come back as main's workers, resumed as the pane's agent with the worker's flags, and no
other conversation does: a card's agent a ship started, or a Claude you opened by hand, is refused.

Watch for: worker numbers stay put while others close, and a new one takes the lowest number free,
so it can appear in the middle of the list. Workers come back after a restart only when they were
running Claude Code; a plain shell worker does not.

## workers-decision-2: A pane in another project

`pane claim --project <name|aka>` takes only an exact name or aka from `~/.dashboard/projects.yaml`, in
any case. A fuzzy match is a guess, and a guess here starts a worker in the wrong checkout; the refusal
lists what the word comes close to so the asker can say it again. A closed project is opened through
main.ts's `openProject`, the function the picker's open uses, so it starts, watches its board and goes in
the recent list the same way. The pane belongs to the page it is on: its worker is named for that
project, works in it and takes that project's cards and worktrees. Only its report goes elsewhere, to the
main that claimed it. The claimer and the pane's own project may both run and release it; nobody else.
Which slot claimed a pane is kept in memory only, so after a restart the pane is its own project's.
