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
SendMessage main, since the hook knows nothing of what the worker did. A card's agent a ship or the
review loop started reports to its project's main like any worker (see "Work handed over is reported"
below); a Claude opened by hand tells nobody until a main sends it work.

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
chat-sessions.ts sees the message in main by its sender's name, once the turn that read it ends. A report read before a pause
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

Main hears a report only when the turn that read it ends. Checked 2026-11-08 with the agent SDK
0.3.316 and a throwaway session sent a SendMessage: the peer prompt opens the turn with no message of
its own on the stream, and its `origin`, the sender's name, comes only on that turn's `result`. The
turn main spends on a report is the merge and the `pane release`, longer than the settle after the
worker's stop, so the notice was queued before every report was heard; then the release made the pane
nobody's, the report heard at the turn's end found no worker to cover, and main read the notice at
once, about fifteen times across #221 to #236. So the release takes the notice back: pane.release
forgets the worker's stop notices, and forgetting withdraws one still in main's queue, as a run in the
pane or a close does. A screen worker's hooks count only while the pane is still that worker's, so a
hook of one released a moment ago never reads as the stop of the next one at its number.

A main that reads a report and does not release the worker (#219, 2026-11-06) still got the notice:
queued during its turn, main took it the moment the turn ended, before the app had read the result
that names the report, and a prompt main has taken cannot be withdrawn. So a notice due while main is
mid-turn is held, not queued, and decided when the turn ends: dropped if that turn read the worker's
report, told otherwise. Main's session is started with `CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS`, which
puts `session_state_changed` on the stream: `running` (or `requires_action`, a permission wait) as a
turn begins, `idle` after its `result`. Checked 2026-11-09 with the agent SDK 0.3.316 and a throwaway
session: `running` came before the turn's init and `idle` 3 ms after its result. chat-sessions.ts reads the result's sender first and the idle after it, so the
report is heard before the held notice is decided. A session that ends counts as idle, so nothing is
held for a main that is gone. The sweep that closes finished workers skips a worker whose main
is mid-turn for the same reason: a close told then, "closed without a report read", would reach main
after the very turn that read the report. A worker screen runs without the variable; nothing waits on
its turns.

Watch for: `idle` comes only once main has nothing left to do, so a main that goes from one queued
prompt straight into the next holds the notice through all of them. Main is told late, never twice.
`idle` also waits on main's background work: the CLI holds a turn's result back while a background
agent or a Monitor runs, so a main whose reply has ended can stay mid-turn for as long as that work
does, or for good. A main mid-turn for `PAUSE_CEILING_MS` counts as idle: every notice held for it is
told then, one due later is queued behind the turn, and the close sweep no longer skips it: late, never
silent. The ceiling counts from the turn's start, one clock, so a notice due late in the turn is not
held a ceiling of its own past one told before it. A
session state the CLI stops sending leaves nothing held: the notice is queued as before and taken
back only if main has not yet taken it.

**A throwaway worktree is not on the worktree record.** That record is per card, and a throwaway
worktree has no card. The manager's worktree list finds it through git like any other folder, and
release removes it only once `unfinishedWork` in finished-work.ts says its work is committed, pushed
and has a pull request. Kept otherwise, and the reply says why. Which pane held it lives in memory, so
a restart forgets it and it is left for the manager's list to remove.

**Release kills only main's worker, while it is still there.** main.ts keeps one record of the panes
holding main's worker now: a session run adds the pane, and the agent exiting, anything else started in
the pane, or the pane closing takes it out. session.json marks those panes `dispatched`, so after a
restart they come back as main's workers, resumed as the pane's agent with the worker's flags, and no
other conversation does: a Claude you opened by hand and no main ever sent work is refused.

**Work handed over is reported, however it arrived.** The report line, `SendMessage to main-<project>
when done`, used to be added only by `pane run`. Work that reached a pane any other way carried no
line and no dispatcher: `pane send` into a pane, a ship, the review loop. A worker on another project
(2026-11-09) finished a pull request and told nobody, then said nothing marked the task as coming
from another session. Now pane.dispatch gives a ship's and the review loop's agent its project's main
as dispatcher, and pane.send makes an agent a main sends text the main's worker and adds the line to
the text (send.ts holds the rule: only to an agent that reports its turn ends, since a shell would run
the line). So the stop notices, their withdrawal and the false-notice rules above cover these panes
too. Text sent to a shell is typed as it is and hands nothing over, and so is text sent to Claude Code
started without the worker hooks (resumed from the drawer): handed over, it was listed at work forever,
its stop never told and the app never closing it.

What this costs: a ship's agent on a Claude screen is main's, so /clear, /resume, /branch and /rewind
are refused in it as in any worker screen, and main may release it. A screen you opened by hand and
main then sent work keeps its owner (screen-owner.ts) and, after a restart, comes back as yours, not
main's worker: screen-workers.json is not rewritten on a send.

**The app closes finished workers.** Mains were told to `pane release` a worker once they had its
report and often did not; the user closed finished panes by hand. auto-release.ts decides, every half
minute, whether each pane holding main's worker is closed through pane.release (actions-rule-1),
which keeps a worktree with no pull request as before. It is closed only once its turn has ended with
nothing in flight or scheduled, and then when its card (the worktree record naming the pane) is Done or
Cancelled on the project's own board, or when main has read a report from it since work was last sent
and nothing was sent, read or stopped for `workers.closeAfterMinutes` (settings.json, default 10, 0
for the card only). Never a pane no main handed work, the pane a page of any screen puts the
keyboard back on (a zoomed pane always is), a worker blocked on a question or paused on its own
background work. Nor any pane on the manager page: the saved layout has no manager page, so the pane
you are typing in there cannot be told apart, and the manager's main releases its own workers. Each close
is logged with pane.release's answer and shown as a passing notice, `Closed pane 2:3: card done`.

The card's Done is read on the project's board, not the worktree's: a card agent moving its own copy
to Done while it waits for CI is still at work, and it is its turn ending, not the column, that lets
the pane go.

Watch for: a worker brought back by a restart has said nothing to its hooks yet, so it reads as at work
and is not closed until it runs and stops again.

Watch for: worker numbers stay put while others close, and a new one takes the lowest number free,
so it can appear in the middle of the list. Workers come back after a restart only when they were
running Claude Code; a plain shell worker does not.

## workers-decision-2: A pane in another project

`pane claim --project <name|aka>` takes only an exact name or aka from `~/.dashboard/projects.yaml`, in
any case. A fuzzy match is a guess, and a guess here starts a worker in the wrong checkout; the refusal
lists what the word comes close to so the asker can say it again. A closed project is opened through
project.open, the action the picker's open uses, so it starts, watches its board and goes in
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

## workers-decision-5: A worker is a Claude screen unless `pane run --terminal`

**A worker runs as a Claude screen, the Agent SDK pane main already is, unless main asks for the
terminal with `--terminal`.** Agreed with the user on 2026-11-05 in stages: opt-in behind `--screen`
first, the default only once it had held up on real cards. It became the default on 2026-11-07 (card
0e903031), once the blockers below that could end a turn were settled. `--screen` is still accepted and
changes nothing, so a prompt written for the opt-in keeps working.

Windows keeps the terminal by default: it has no screen host (workers-decision-6), so a screen's turn
there ends with the app, which is the blocker the default waited on. `--screen` still asks for one. The
condition is `hasScreenHost` in `screen-host-protocol.ts`, which `screenHostSocket` reads and
`defaultPaneKind` in `pane-kind.ts` turns into the default that pane.dispatch starts and main's prompt
describes; the parse in `session-cli.ts` only reads which flag was given (workers-decision-8). Telling main in the usage text instead was weighed and rejected: a main
asked to dispatch does not reread its usage, and a worker that dies on a quit is not something a
sentence prevents.

How it is built, so the chat code does not fork:

- The screen runs in `chat-sessions.ts` under a key of its own, `screenKey(<pane id>)`, in the same
  numbers the pages' slots use. Every chat channel and event already names a slot, so the renderer's
  Claude screen (`createChatView`) is reused as it is; only the pane wiring knows it is a worker.
- Its folder, conversation id (chosen by the app and in the session index, as for a terminal worker),
  name, auto mode and hooks come from `screen-workers.ts` through `ChatHost.worker`. No dispatch prompt
  is appended. /clear, /resume, /branch and /rewind are refused on it: it keeps the conversation it was
  started on, which is what a restart resumes.
- Done detection is the session's own Stop hook, as an SDK callback in the app, not a `session notify`
  command: its input carries `background_tasks` and `session_crons` natively, which feed the same
  `stop-notices.ts` rules (workers-decision-1). UserPromptSubmit and PostToolUse report running. A
  permission question is the screen's own ask, which marks the pane blocked. Stop does not run for an
  interrupted turn or a session that dies, so the SDK's `result` and the session's end also end the turn
  for the review sweep, without a report to main. A worker back from a restart starts with its turn over, unless the screen host kept it mid-turn (workers-decision-6).
- Pane readings carry `screen`, so `paneIsBusy` and every picker and refusal built on it count the pane
  as an agent's; its hidden shell sits at a prompt and its command runs nothing.
- The pane keeps its plain shell, hidden under the screen, so everything that counts panes, releases
  them and brings shells back after a restart is unchanged. `screen-workers.json` in the user data
  holds each screen worker by project and pane number, so a restart opens it again on its conversation.

What the trial run showed (one real Backlog card, b96468cf, run with `--worktree --screen` in a
throwaway clone on a second instance; it opened draft PR #216, left unmerged):

- Worked: the prompt and folder, Bash, the board command, `/simplify` and `/pr-loop` with their
  subagents, a background `pnpm test`, plugins' MCP servers, SendMessage to its main, the done report,
  `pane send` as a prompt, an AskUserQuestion answered from the box with the pane marked blocked until
  then, the foot's model, mode, context, seven-day limit and `warm 59m`, and a restart: the worker came
  back as a screen on its conversation and answered from it.
- Different: the screen skipped the folder-trust question a terminal worker asked in a new folder.
- Memory after one short turn each: the terminal worker's Claude 205 MB PSS plus 112 MB of MCP
  servers, the screen's 182 MB plus 86 MB; the screen's share of the renderer was not measured.

What blocked making it the default, each a Backlog card. The two that could end a turn or refuse
work are settled (struck through here, and the `gh pr create` refusal below); the rest stay open and
are watched on real cards rather than held against the default:

- ~~A worker screen's Claude is the app's child, so a restart ends the turn it was in.~~ It runs in the
  screen host now, off Windows (workers-decision-6).
- The working line once kept counting after the turn ended, and the real card's screen once showed no
  reply after a `pane send` its transcript had. Neither was reproduced.
- The task strip was never caught with a row in it, so it is unchecked on a worker screen.
- A worker screen is not read by the working-panes sweep, so the review sweep counts it working until its
  Stop hook says done rather than by its spinner.
- A screen started fresh in the project folder (no `--worktree` or `--card`) shares its folder with main;
  its /resume list shows main's conversations.

Not a blocker after all (checked 2026-11-06, card 01509ff6): the trial's refusal of `gh pr create`. A
worker screen is asked as a terminal worker is:

- Every settings file loads (`settingSources` in `chat-sessions.ts`), so the user's allow rules apply
  first. With `Bash(gh pr *)` allowed, the trial's exact command ran with no question under
  `--permission-mode dontAsk` in the CLI and the SDK's pinned binary, and through `query()` with the
  screen's options.
- A call auto mode cannot decide comes to `canUseTool`, the question in the box (chat-decision-1).
- A call auto mode blocks is refused in the terminal too; neither asks until repeated denials.

Why the trial's session reached the classifier is not known: its debug log and demo instance are gone.
If a worker screen is refused again, run the command through the CLI with `--permission-mode dontAsk`
in the same folder; a refusal there means the rules did not match, not that the screen differs.

## workers-decision-6: A worker screen's session runs in the screen host, outside the app

**A worker screen's Agent SDK session runs in the screen host, a detached `node` process beside the
pane host, so a quit or restart leaves its turn going the way a terminal worker's goes on in the pane
host.** Card 461bb646, the first of workers-decision-5's blockers. A page's main stays in the app: it
is resumed on its conversation at every launch, and nothing waits on it mid-turn the way main waits on
a worker.

Why a process of its own rather than the pane host: the SDK and every session's traffic would then
live in the process holding every terminal of every project, and a session that crashes it or grows
in it takes them all down. The two share their socket code instead: `reachHost`, `attempt` and
`acceptApps` from `src/main/panes/host-socket.ts`, the framing (`line`, `lineReader`) and
`prepareHostSocket` from `pane-host-protocol.ts`, and `launchPaneHost` from `pane-host-client.ts`,
which starts either host.

How it is built:

- `chat-sessions.ts` still drives every session. For a worker it asks the screen host first and gets
  back a Query whose methods all go over the socket (`hostedQuery` in `screen-host-client.ts`); with no
  host it runs the SDK in the app as before. Nothing else in the chat code knows the difference.
- The host keys a session by its conversation id, which stays the same across a restart where its pane
  id does not. The app's `start` for a key the host already runs takes that session up instead of
  starting another.
- The callbacks stay in the app. A question (`canUseTool`, `onElicitation`) is sent to the app and
  waits for its answer, through a restart if it has to; the app that takes the session up is sent the
  questions still waiting. A hook is answered by the host at once and told to the app, held while no
  app has the session: a Stop hook that ran while the app was away reports done to main when the
  project opens again. A held hook keeps only its name, Stop's input excepted. Every hook the app
  has today returns nothing, so none needs its answer heard.
- Messages are not held, but for a result: a screen opening reads its conversation back from the
  transcript, as it does after any restart, and a result is what says a turn ended without a Stop
  hook (an API error, a usage limit). The host counts a turn running from UserPromptSubmit to the
  result, so a worker taken back mid-turn is counted working for the review sweep, and one whose
  turn ended is not.
- A stop ends the session in the app at once, and the host tells the app nothing more of it, so
  nothing of the one still closing can land on a new session under the same key. A start for a key
  the app just stopped begins a new session.
- An option that is a callback, other than those, is refused rather than dropped by the line.
- The app tries to reach or launch the host once per run, shared by every worker starting together,
  and again once a host it had went or one answered and turned it away.
- The host answers one app at a time, as the pane host does. It exits once no app is connected and no
  session runs.
- One live session per worker, whatever happened to the host (card c5b8a687). On 2026-11-09 earlyoom
  SIGKILLed the host; its sessions share its process group, heard nothing, and ran on with parent pid
  1, while the next start of each worker launched a new host that resumed the same conversation: two
  sessions in one pane, both working. So the host writes its pid beside its socket
  (`screens-1.sock.pid`), and a host starting kills the group of the one recorded there if that pid
  is dead (`dead-host.ts`). Only then: Linux hands no pid out again while a group still carries it, so
  a dead pid's group is the old host's leftovers and nothing else. The file names the boot too, and is
  removed once acted on, so a number from before a reboot, or one already used, is never signalled; what
  is left is the leftovers ending by themselves and the pid coming round to a process whose own group
  outlives it, all before the next worker starts. A host starting also leaves the
  socket alone while another answers on it, rather than taking it and running a second copy of each
  worker its app asks for (`claimHostSocket` in `host-socket.ts`, which the pane host's start uses too,
  so two pane hosts started together leave no shells where no app can reach them).
- Not done: the orphans are ended at the next start of a worker or a host, not the moment the host
  dies, so a killed host's sessions can finish their turns unseen until then. Tying each CLI's life to
  the host's (a parent-death signal, or stopping its scope) is the follow-up.
- With no host, a worker runs in the app only once nothing answers on the socket, and after the same
  kill. A host that answers but would not take this app (a second Dashboard on the same user data, or a
  host too slow to say what it kept) may be running that very worker: the start is refused, the screen
  says so, main is told the worker stopped (so it can dispatch again), and the next prompt tries again.
- It is run by the `node` a login shell finds, as the pane host is, so the Agent SDK is bundled into
  `screen-host-entry.mjs` (node cannot read it inside the asar) as an ES module, since the SDK reads
  `import.meta.url` as it loads. The CLI binary is the app's unpacked one, named in the options.

Checked by hand with the bundled host and the real CLI (Haiku), a stand-in app on the socket: a turn
running `sleep 15` went on after the app quit 1.5s in and wrote its file 14s later; a second app saw it
`busy` while running and heard its reply, result and Stop hook live, or, arriving after it ended, saw
it idle and heard the held Stop hook. Stopping every session let the host exit.

Watch for:

- Windows has none: a named pipe needs the proof the pane host does (`paneHostAddress`), not built yet.
  Worker screens there still die with the app.
- A tool a session ran in a process group of its own (a detached dev server) is not in the host's
  group, and outlives the kill; its systemd scope, when it has one, ends it with the pane.
- A protocol bump, or an app update that changes the socket's name, leaves the old host's sessions
  running unseen; a worker brought back then resumes its conversation in a second process. Bump only for
  a change an older host would misread.
- A session that dies while no app is connected and is the last one running takes the host and what it
  held with it; that worker comes back with its turn over and main is not told, as before.
- A session in the host runs the build that started it until it ends, as a terminal worker's Claude does.

## workers-decision-7: A Claude screen opened by hand is yours, not main's worker

**New Claude opens a worker pane as a Claude screen of yours: in the project's folder, empty, and
started only by your first prompt.** Card 20be4145. The title row's new-pane button became two halves,
New Terminal (the old button and `terminal-add`) and New Claude (`terminal-add-claude`, Ctrl+Shift+A).

How it is built, on the worker screen's own path so nothing forks:

- `pane:add` takes a `claude` flag; `worker-channels.ts` opens the worker as before, then hands it to
  pane.dispatch with no prompt (workers-decision-8), which starts it through `screen-workers.ts`'s
  `start`; that saves it in `screen-workers.json` with a new id from the
  session index (so the drawer lists it) and no first prompt. Its session starts on the first prompt
  and runs in the screen host as a worker screen's does (workers-decision-6), so it outlives a restart
  off Windows, and comes back on its conversation when the project opens.
- Which screen is whose is `screen-owner.ts`: saved with a dispatcher's folder it is main's worker,
  saved with `null` it is yours. A file from before this names a dispatcher on every screen.
- Yours reports to nobody: it is never put in main.ts's `mainsWorkers`, so `session-requests.ts`
  never tells a main of its stop, and `pane release` will not kill it. Its hooks still mark the pane,
  so a question still turns its edge yellow and a turn end green.
- The refusals of /clear, /resume, /branch and /rewind are main's worker's only:
  `keepsItsConversation` in `actions/session/conversation-ports.ts`, asked by the four session actions. On yours, all four carry the
  screen on in another conversation through `ScreenSession.carryOnIn`, which saves it, so a restart
  resumes the one it was last on. Nothing of main's is touched: main's remembered conversation and its
  pending rewind cut are kept per project, which the screen shares with main.
- So a /rewind of the conversation on yours forks a copy cut at the prompt at once, rather than
  holding the cut until the next prompt as main does; the original stays in /resume's list either way.
  A /resume of the conversation main is on is refused as running in main: two Claudes on one
  conversation each write their own turns into it.

Watch for: a `conversation_reset` the CLI sends by itself moves the session to a new conversation that
the saved screen does not follow, so a restart after one resumes the conversation from before it. Every
/clear the screen sends goes through `chat:reset` and is followed.

Watch for: the session index row is written when the screen opens, as a dispatched worker's is when it
runs, so a New Claude closed before its first prompt leaves a drawer row with no conversation behind it.

## workers-decision-8: Every agent a pane starts goes through pane.dispatch

**One action, pane.dispatch (`src/main/actions/pane/dispatch.ts`), starts every agent in a pane and
decides once whether it is a Claude screen or Claude Code in the terminal.** Card ece7e995. #227 made
a screen the default for `pane run` alone: a ship, the review loop, a resume after a restart and New
Claude each started their pane their own way, so a card shipped on v2.43 on Linux still opened a
terminal worker.

`paneKind` is the whole choice: a resume is a terminal (a screen comes back through
`screen-workers.ts`'s `comeBack`, never here); no prompt is New Claude, a screen; otherwise
`pane run --screen` or `--terminal` wins, and with neither it is `defaultPaneKind`: a screen wherever
`hasScreenHost` (not on Windows). Main's prompt tells main the same default from the same function. What either half is started with follows from the caller's input: main's worker gets
its hooks and report-back prompt, and since 2026-11-09 so does a card's agent, which reports to its
project's main (workers-decision-1).

The action also claims the pane for the main a worker reports to, so no caller sets `mainsWorkers`
after it, and decides when a screen's hidden shell is started over (`screenNeedsShell`: wherever it
is not already running in the screen's folder, so the status bar, a removal's kill and the sweep's wait,
which all read the pane's folder off its shell, see a screen's pane where its agent works). Removing a
worktree closes the screens working in it (`closeIn`), as it kills a terminal agent's shell. The action
runs synchronously (`startPane`), so a throw reaches the caller's own catch. The ports are in `pane-actions.ts`, main's wiring: `startAgent` in main.ts became its terminal
half, and `screen-workers.ts`'s `openByHand` folded into `start`. Nothing else calls either. A new
place that needs an agent in a pane is a caller of pane.dispatch, with its case in `dispatch.test.ts`,
not a sixth path.

What it changes, on purpose:

- A card's agent and its review loop are Claude screens off Windows. Saved with their project as
  dispatcher since 2026-11-09, they come back after a restart as main's worker screens, the card's
  record naming the pane again as a terminal agent's does.
- A screen's pane stays busy until it is closed, as a terminal agent's does while Claude Code runs, so
  a ship takes a new pane rather than one whose screen has finished its turn. Closing it frees it.
