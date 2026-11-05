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
`session list` says `done`, and for a pane main's worker is in, the app may queue a short prompt into
the session of the main that dispatched it (the claimer's, for a pane claimed with `--project`): the
worker's name, its pane, and that it stopped without a report. It goes through the session's own queue
(chat-decision-7), so a main mid-turn reads it after the turn. That is the report main can count on when
a worker forgot to write or died before it could. The worker's own prompt still ends by telling it to
SendMessage main, since the hook knows nothing of what the worker did. A card's agent a ship started and
a Claude opened by hand never tell main: neither is main's worker.

**A turn end is not a stop.** A worker's turn also ends while it waits on its own background work — a
review subagent, `/pr-loop`, CI — and the next notification wakes it. Telling main at every Stop hook
(#176) gave it dozens of prompts per card, each a turn spent checking `pane list` and saying "still
waiting". #209 told main only once the worker had stayed out of `running` for three minutes, which
made every real stop three minutes late.

Claude Code's Stop hook input says which it is. `background_tasks` lists what is still in flight
(shells, subagents, monitors, workflows; empty when nothing is) and `session_crons` what is scheduled
to wake the session (CronCreate, ScheduleWakeup, `/loop`). The worker's hook runs `session notify <id>
done --stop-input`; the command reads the input and sends the app only the two counts. Checked against
Claude Code 2.1.318 with a throwaway `claude -p` whose Stop hook logged its input: the stop it ended
with a `sleep 25` still running in the background had `background_tasks: [{type: "shell", status:
"running", ...}]`, and the stop after the task woke it had `[]`; `session_crons` was `[]` in both.

So stop-notices.ts decides each stop on its own. Anything in either list is a pause: nobody is told,
`pane list` and the workers popup say what it waits on, and the next stop decides again. Both empty is
the worker done: main is told after `REPORT_SETTLE_MS`, ten seconds, which is there because a report is
counted only once main reads it, and an idle main reads one sent just before the stop within that. Only
once until the worker runs again. A stop the worker's own SendMessage covers gets no notice at all:
chat-sessions.ts sees the message arrive in main by its sender's name. A report read before a pause
still covers the stop after it. The Claude screen draws the notice as a status line, not a prompt
bubble, since nobody typed it; the older wording, still in conversations saved before this, is drawn
the same way.

The three-minute grace (`STOP_GRACE_MS`) stays only for a stop that sends neither count: a Claude Code
older than the fields, whose input lacks them, or a worker started before this whose hook still runs
plain `notify <id> done`. Dropping it would bring back a notice per turn end for those.

A main busy for longer than the settle reads a worker's report only after the notice was queued, and
a main mid-turn for ten seconds is its normal state while it dispatches. So the notice is taken back
when the report is read: `tell` answers with the queued prompt's uuid, and `heard` withdraws it through
chat-decision-7's `cancelAsyncMessage`, which does nothing once main has taken the prompt.

A pause has a ceiling, `PAUSE_CEILING_MS`, thirty minutes: a worker that leaves a dev server, a watcher
or a hung `gh pr checks --watch` running and forgets to report is never woken, so no later stop would
come. Past the ceiling main is told once, unless a report covered it, in its own words: the worker is
paused, waiting on its own background work, not stopped. Told it had stopped, main may release it and
kill the work it waits on, while `pane list` says paused. The stop that ends the pause is still told,
since main heard only that the worker waits.

Watch for: a report main reads only after it has already taken the notice into a turn. The notice
cannot be withdrawn then, and main reads both; that needs a main that finishes its turn between the
settle and the report arriving.

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

## workers-decision-3: Who dispatched a worker, and the screen's links and popup

`session-requests.ts` keeps one record per worker a `pane run` started: the slot whose main ran it and
the first words of its prompt, until it is released, its number is claimed again, or its pane closes
or something else starts in it (main.ts calls `forget` where it drops its own mark). An agent that
only exits keeps its record and is listed idle. It sits beside the
hook states `pane list` already reads, so the done report, the foot's count and the workers popup all
read the one record rather than a store of their own. It is not `dispatchers`, which says who may run a
pane, not who did: a project's own main may run a pane the manager claimed on its page, and then its
own main hears the report. Kept in memory, as `dispatchers` is, so after a restart a resumed worker is
listed by nobody and reports to its own page's main.

**A pane reference is an address, not a bare id.** `pane run` and the done report print
`dashboard://pane/<slot>:<index>`; the screen links only that, so `2:1` in a reply about a time or a
ratio is never a link. It names the number, not the worker: numbers are reused, so an old link lands
on whatever holds the number now, and a link to a number nothing holds says the pane is not open.
`pane claim` still prints the bare id: main pipes it into `run`, and a second token there would be
one more thing to strip. A link is drawn from text nodes only, so an address in an attribute stays
text.

**The popup is the search dialog, not a box anchored to the count.** It is the same dialog every
picker uses, with the arrows, Enter and Escape already right, and it now takes a `watch` so it reads
main again while it is open. Anchoring it to the button would be a second list dialog to keep in step.
The keyboard way to a worker is the popup (Alt+W); a link is the mouse's.

Watch for: the count refreshes on a hook mark and on the open-pane list changing. A worker whose agent
exits without either shows as working until the next one.

## workers-decision-4: The command and the app must be the same build

**The app answers only a command with its own build stamp, `<version>+<commit>`.** A rebuild replaces
the command files while the old app keeps running, so a pane's command is newer than the app it asks
until the restart. Matching the stamp exactly, not a protocol number, means nobody has to remember to
bump one when a request changes shape: any rebuild from another commit is refused with a line naming
both builds and saying to restart. A command older than the stamp sends none and is refused the same,
whether it ends its request with a newline or, from before #196, by closing its side. `notify` is the
one exception, let through from any build: it is what a worker's hooks send, a refusal there lands in a
hook log nobody reads, and the worker would stay `running` with its main never told. Its words have not
changed, and an unknown state is still refused by the parser.

**The app accepts a request before answering it, and only the acceptance is timed.** An app from before
the stamp cannot refuse anything; it hung waiting for a half close the command no longer sends. So the
app writes a newline the moment it has read a request it will answer, and the command gives up after
5 seconds of silence with a line saying the app is likely older and needs a restart. Timing the whole
answer would cut off `pane run --card`, which waits for a worktree to be made.

Watch for: an app too busy to read its socket for 5 seconds is reported as older than it is. The
request is already written when the command gives up, so that app, or an older one that answers without
accepting, may still claim or dispatch; the line says to check `pane list` after restarting before
asking again, or a card can end up with a second worktree and worker.
