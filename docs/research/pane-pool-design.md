# Review: an app-held pane pool with a queue and a 4-running cap (card 26f1e38e)

2026-11-26: a point-in-time study, not a rule.

Read-only research against `main` at 58a18c2f. Line numbers are from that commit.

## Verdict

The idea is sound, and the code already has the single point it needs: every agent a pane starts
goes through one action, pane.dispatch (`src/main/actions/pane/dispatch.ts:11-14`, `:111-115`;
workers-decision-8). Nothing in the app limits how many run today. I found no cap in `src/`,
`docs/`, main's prompt (`src/main/workers/dispatch.ts:86-164`) or this project's memory, so the "4
running" rule lives only in what the user tells main. That makes main the only thing keeping count,
and it shows: card c5b8a687 (comments #1 and #4) is the 2026-11-09 night when eight workers ran
tests at once, earlyoom killed the screen host, and panes ended up with two sessions each.

Three things in the idea as stated need changing before it is built:

1. **The gate goes in front of pane.dispatch's new-work callers, not inside pane.dispatch.**
   pane.dispatch also runs restore after a restart and New Claude (`dispatch.ts:109-110`). Queueing
   a resume means the pane restore promised stays empty. Queueing New Claude means a person's own
   screen sits waiting behind main's backlog.
2. **A queued entry cannot hold a pane.** Today main runs `pane claim` and then `pane run <id>`
   (`workers/dispatch.ts:101-106`, `:80-85`). If a queued run kept its claimed pane, six queued
   entries would leave six empty shells on the page. Worse, a ship would put its agent into one of
   them: `freePaneIn` hands out any free shell pane (`src/main/main.ts:615-617`). The pane has to be
   picked when the entry starts, as a ship already does (`main.ts:646-663`).
3. **A budget gate on `budget`'s exit code alone would block every install that has no limit
   set.** The default settings are `limit: 'cap', weeklyCap: null`
   (`src/shared/settings/settings.ts:123`). With those, `budgetVerdict` answers exit 2, "no weekly
   cap set" (`src/main/command/budget-cli.ts:81-85`, `:113-114`). Concretely: a fresh install
   queues its first worker past the cap and that worker never starts. The pool has to treat "no
   limit configured" as no gate.

## How things work today (what the pool touches)

- **Claim** opens a shell pane, records who claimed it and prints the id. It starts nothing
  (`src/main/actions/pane/claim.ts:31-48`).
- **Run** refuses a pane that already has an agent or a busy program
  (`src/main/workers/session-requests.ts:271-273`). It makes a `--worktree` throwaway inline before
  it starts (`:287-297`), and only then calls `startWorker` and marks the pane `running`
  (`:314-320`). That is why `run --worktree` and `board ship` need main to set a ten-minute timeout
  (`workers/dispatch.ts:117-123`, `src/main/board/board-usage.ts:28`,
  `docs/workers/README.md:87`).
- **Ship** checks the checkout is clean, fetches, makes the worktree, records it, then calls
  `attachPane` (`src/main/ship/ship-flow.ts:44-83`). Ships within one project already take turns
  through `queue` (`ship-flow.ts:29`, `:105-121`; `main.ts:669` `oneAtATime`). That queue is a git
  lock, not a concurrency cap. `attachPane` picks a free pane or opens a new one and dispatches
  (`main.ts:646-663`). The card moves to Doing when its pane is given (`main.ts:638-640`).
- **The review loop** is started by the app itself, not by main. With `review.autoLoop` on (the
  default, `settings.ts:120`), the review sweep starts a review agent once a shipped card's agent
  stops with a pull request. "A review that finds every worker busy opens a new one"
  (`src/main/ship/review-flow.ts:313-316`, `:325`). So even a main that counts perfectly can be
  pushed past 4 by the app.
- **Worker states** are held only in memory, in `states` (`session-requests.ts:162`). `stateOf`
  reads them as `running`, `blocked`, `done`, `paused, waiting on …` or
  `done, work in: pane finish` (`:240-249`). "Paused" means the Stop hook reported background tasks
  or wakeups still pending (`src/shared/workers/worker-roster.ts:15-21`). The hook reports only
  counts, so the app cannot tell a `pr wait` on CI from a `vitest` run.
- **Release.** `pr land` and a board move into Done or Cancelled ask for `pane landed`. That
  releases the panes `releaseVerdict` allows and keeps the rest as "done, work in"
  (`session-requests.ts:428-443`; `src/main/workers/auto-release.ts:28-35`). `pane finish` releases
  once the card is finished or the branch has merged (`session-requests.ts:378-384`). Nothing closes
  a pane on a timer (`auto-release.ts:5-8`).
- **Budget** is a reading of `~/.claude/usage-7d.json` against the settings limit, and it goes
  stale after 30 minutes (`budget-cli.ts:15`, `:100-120`). Main is told to check it before each
  round of a loop (`workers/dispatch.ts:140-144`).
- **Machine load from tests** is already gated machine-wide: one heavy test, build or typecheck at a
  time (workflow-decision-14, `docs/workflow/decisions.md:361`). So the cap is for memory (about
  300 MB per Claude process, card c5b8a687 #2), tokens and the user's attention, not CPU from test
  runs.

## Proposed design

### The pool

There is one pool per app, held in main next to `sessionRequests`, which already owns the states.

The decisions go in a new module, `src/main/workers/pane-pool.ts`, with a `.test.ts`
(workflow-rule-2):

- `holdsSlot(look)` says whether a worker counts against the cap.
- `nextToStart(entries, running, cap, gate)` picks the entry to start next, or the reason the queue
  is held.

A new action does the queueing (actions-rule-1): `src/main/actions/pane/queue.ts` with
`pane.queue`, `pane.unqueue` and `pane.start`.

### What holds a slot

A pane holds a slot when it is open, has an agent, belongs to main (`mainsWorker`,
`session-requests.ts:170`, which also covers card and review agents) and is not `done`. So:

| State | Holds a slot | Why, with what happens |
|---|---|---|
| running | yes | It is working. |
| blocked on a question | yes | It carries on the moment you answer. If you are asleep, it holds the slot all night, and `pane queue` says `held: 2:3 blocked on a question`. |
| paused on background work (a worker waiting on CI, a review loop's `pr wait`) | yes | The hook cannot tell CI from a test run (`worker-roster.ts:15`). If a paused worker freed its slot, its CI wake-up would make five working when the cap is four. Cost: a review loop that waits 15 minutes on CI keeps a queued card waiting 15 minutes. |
| a review loop | one slot | `/pr-loop`'s rounds are subagents inside one session. |
| done, or done and kept (`done, work in`) | no | Its turn is over and it uses no tokens. Ten kept panes still use about 3 GB. That is a job for `pane finish`, not for the cap, because nothing closes a pane on a timer (`auto-release.ts:5-8`). |
| a Claude you opened by hand, main itself | no | It is not main's worker (`dispatcherPath` null, `actions/pane/dispatch.ts:27-29`). |

The cap only gates starts. It never stops work already running:

- **`pane send` to a done worker is never queued.** Main's follow-up to a worker that has
  reported goes in at once. If the slot it freed was taken in the meantime, five are working until
  one finishes, and nothing new starts until the count is under 4 again.
- **Restore after a restart is never queued.** If six workers were running when the app quit, all
  six come back (`actions/pane/restore.ts:13-20`), and the queue waits until two of them finish.

Starting is synchronous up to the mark. A slot is taken before the first await, as `sweepOne`
marks its card before awaiting (`review-flow.ts:238-240`). Without that, two workers that stop in
the same tick would both see 3 running and start two entries, leaving 5.

### What goes through the queue

| Door | Today | With the pool |
|---|---|---|
| new `pane start [--project p] [--card c \| --worktree \| --in f] [--first] [--after <card>] "<prompt>"` | (claim + run) | Claims a pane and runs it at start time. Queued when full. |
| `board ship <id>` and a move into Ship | ship-flow, then attachPane | Queued **before** the worktree is made. The card waits in Ship, and its worktree is cut from a fresh base when it starts. |
| the review sweep's start | attachPane, which opens a new pane even when every worker is busy | Queued as a `review` entry. The sweep already marks the card (`review-flow.ts:325`), so it does not queue the card twice. |
| `pane run <id>` into a pane main already holds | runs | **Refused at the cap**, with `4 running: use pane start to queue`. It stays as the way to restart a stopped card agent (`run --card`), but it is no way around the cap. |
| `pane send`, restore, New Claude, the drawer's resume | runs | Unchanged, not gated (see above). |

What a queued entry holds:

- the dispatcher's project path (the main that is told);
- the target project;
- the kind (`run`, `ship` or `review`) and its flags;
- the prompt or card id;
- `queuedAt`, and the optional `after` gate.

Refusals that can be checked early happen at queue time: a folder that is not there, a card that
already has an agent, a card that is already queued. All of them are checked again at start. If one
fails then, main is told, and the next entry starts.

### Queue order, reordering and withdrawing

Entries start first in, first out, across all projects. Two flags and two commands change that:

- **`--first`** puts the entry at the head. Example: three refactor cards are queued and an urgent
  bug comes in. `board ship <bug> --first` starts it next.
- **`pane queue`** lists the entries in order, plus the reason the queue is held, if it is:
  `q7 2nd dashboard ship 26f1e38e "Pane pool"   queued 4m`.
- **`pane unqueue <q7>`** withdraws an entry. A card withdrawn this way goes back to Todo. To
  reorder, unqueue and re-add with `--first`. A full `queue move` is not worth it until a real
  backlog asks for one.
- **A card moved out of Ship by hand, or into Done or Cancelled, drops out of the queue.** Its
  entry is gone at the next drain (`finishedColumnOf`, `auto-release.ts:39-42`), so a card the user
  cancelled does not start an hour later.

**File overlap is not something the app can decide.** A queued card has no file list yet; its
files exist only once an agent has written them. What the app can enforce is the order main
decides on, through **`--after <card id>`**: the entry is skipped (it does not block the head)
until that card is Done or Cancelled, which the pull request follow already sets on merge.

Example: open PR #400 (card A) rewrites `session-requests.ts`, and card B will also touch it. Main
runs `board ship B --after A`. B waits while C and D, queued later, go ahead of it. When #400
merges, A moves to Done, and B starts on a base that has A's change, so there is no conflict and no
`/pr-conflicts` round. Spotting the overlap stays main's job: it reads the card and runs `gh pr
diff --name-only`.

### Global, not per project

There is one cap for the whole app. Every reason for the cap is machine-wide or account-wide:

- the out-of-memory night was machine-wide (c5b8a687);
- the heavy-run lock is machine-wide (workflow-decision-14);
- the budget is the account's 7-day usage (`budget-cli.ts:5-10`).

What happens: the crm main queues three cards at 10:00 and the dashboard main queues one at 10:01.
The dashboard card starts fourth, unless it was queued with `--first`. An entry whose project is
not open is skipped, not blocking the head, and starts once its project opens. An entry claimed
with `--project` opens that project when it starts, as `pane claim --project` does
(`claim.ts:36-41`).

### Budget gate before each start

Before each start, the pool calls `budgetVerdict` in the app, with the same reader and settings
`budget` uses (`budget-cli.ts:100`):

- **Exit 0**, or no limit configured (`limit: 'none'`, or `cap` with `weeklyCap` null): it starts.
  This is the fix for point 3 of the verdict.
- **Exit 1, over the limit**: the queue holds. Each main with an entry is told once:
  `queue held: 81% of the 7-day usage used, weekly cap 80%`. It is not told again until the reason
  changes.
- **Exit 2, stale or missing reading**: the queue holds and says so. The reading goes stale only
  when no Claude has finished a turn for 30 minutes, and every worker's turn rewrites it
  (`budget-cli.ts:21-38`). So this happens only when the queue was already held for something else
  and everything is idle. Main's next turn writes a fresh reading, and the pool checks again after
  each turn ends.

Example: the weekly reset passes overnight while the queue is held at 81%. At 08:00 the user's
first message to main ends a turn, the reading is now 3%, and the first queued entry starts.

### What the caller gets back

- **Under the cap**, the start answers at once, `starting 2:4 dashboard://pane/2:4`. The worktree
  is made and packages are installed after the answer. If that fails, the dispatching main gets a
  notice, through the same `ports.tell` that done-notices use (`session-requests.ts:216-227`). This
  is what deletes the ten-minute timeout.
- **At the cap**, it answers at once, `queued q7, 2nd: starts when a worker frees (4 running)`.
- **When an entry starts**, the dispatching main gets one notice:
  `q7 started as dashboard-terminal-4 in 2:4 dashboard://pane/2:4`. If the entry was dropped at
  start, the notice is `q7 dropped: card 26f1e38e is Done`. Like a done-notice, it waits behind
  main's turn if main is busy.

Main never has to poll. Its existing done-notice and the started-notice are its whole loop.

### Across an app restart

The queue is saved to a file, `pane-queue.json` in the app's user data next to `session.json`, and
written on every change. If it were lost, main would have been told "queued" and would never
dispatch the work again: the user's planned work would vanish without a word.

At launch, entries come back in order, but nothing starts until the restored panes are back and
counted (`restore.ts:13-20`). Example: the app quits with 4 running and 3 queued. After the
restart, the 4 resume, the 3 stay queued, and q5 starts when the first of the 4 finishes. Entries
whose card finished while the app was down drop at the first drain, and their main is told.

### The cap setting

The cap is `workers.cap` in `settings.json`: a whole number, default 4, or `none`. It is parsed in
`settings.ts`, beside `budget` (`:40`, `:120-123`), and adopted live as the budget limit is
(`actions/settings/budget.ts:4-7`). The settings screen gets a row for it, which the keyboard rule
requires: a row, not a button (conventions-rule-1). The workers popup (Alt+W) can list queued
entries under the workers, using the same states order (`worker-roster.ts:48-49`). A key there to
withdraw an entry is a row in `actions.ts` and in `help.ts` (keys-rule-2). That can come in a
second PR.

Lowering the cap from 6 to 4 stops nothing that is running. New starts wait until fewer than 4 are
running.

## What can be deleted from main's instructions once the pool exists

From `src/main/workers/dispatch.ts`:

- **`claim` and the claim-then-run pattern** (`:101-106`, `:80-85`) become `pane start …`.
  `claim` and `run <id>` stay in `pane --help` for running a stopped card agent again in a given
  pane, but drop out of main's prompt.
- **The ten-minute timeout lines** (`:117-123`), with the matching sentence in `board-usage.ts:28`
  and the scenario at `docs/workers/README.md:84-88`. Start answers at once.
- **The budget paragraph** (`:140-144`) shrinks to one line: "the queue holds over the budget
  limit and tells you; `budget --cap` and `--pace` set it". Main no longer runs `budget` before each
  dispatch round.
- **Whatever the user tells main about keeping 4 running, counting slots or waiting for a slot**
  goes, because the pool counts. That rule is not in this repo; it is in the user's conversations or
  instructions. Also gone: main re-checking `pane list` to see whether a slot freed, and main
  holding a card back until a PR merges, which becomes `--after <card>`.

These stay: the report and done-notice paragraph (`:153-157`), `pane finish` for "done, work in"
panes (`:159-160`), and `pr land`. Releasing is still main's job, and a kept done pane holds memory
even though it holds no slot.

## Rough size and order

1. **First PR**: `pane-pool.ts` with its test (`holdsSlot`, `nextToStart`, the budget gate
   including "no limit configured"); `pane.start`, `pane.queue` and `pane.unqueue` with their
   tests; draining wired to the state changes in `session-requests.ts`
   (notify/release/agent-exit), ship, and the review sweep; `pane-queue.json`; the setting; the
   main prompt edits; docs (workers README and a new workers-decision-11; ship README; settings).
   About 400 to 500 lines with tests.
2. **Second PR**: queued entries in the workers popup, with a withdraw key, `help.ts` and a
   settings row.

`main.ts` is already 899 lines (over the file-size limit, which counts code lines). None of this
goes in it beyond wiring the ports. The pool and its file sit in `src/main/workers/`.

## Questions left for the user

- Should a paused worker hold its slot? This report says yes, because a paused worker can wake on
  its own. The other choice is to count paused workers as free and accept a transient fifth. That
  only works if the Stop hook ever tells a CI wait apart from a test run.
- Should a blocked worker hold its slot forever, or hand it back after the 30-minute pause ceiling
  (`src/shared/workers/done-report.ts:32`)? This report says hold: you answer, it carries on. The
  cost is a queue stuck overnight behind one question.
