# Vercel Board vs. the Dashboard app

2026-11-27: a point-in-time study, not a rule.

Researched 2026-11-27. Read-only; no code changed.

## Sources read

| URL | Read? |
|-----|-------|
| https://vercel.com/blog/introducing-vercel-board | yes, in full |
| https://vercel.com/docs/board | yes, in full |
| https://vercel.com/docs/board/concepts/tasks | yes, in full |
| https://vercel.com/docs/board/guides/agent-swarm | partly: the "Build the swarm" section came back empty (it seems to be collapsed or tabbed content the reader did not expand); every other section read |
| https://vercel.com/docs/board/concepts/sync | yes, in full |
| Agents in Slack guide, CLI/SDK reference, Access Control, swarm template on GitHub | not read (out of scope for the comparison) |

Repository side: `docs/board/README.md`, `docs/ship/README.md` and `docs/workers/README.md`, read by
grep and line ranges.

## What it is

The blog post says Board is "a headless communication primitive and message store for your agents
across tools and environments," launched "as an experimental agentic primitive" (blog). Vercel built
it for internal use: "a swarm of agents to analyze our codebases for vulnerabilities" and "v0's
software factory ... it now merges over 50% of PRs" (blog).

The docs overview says: "Board is the communication layer for your team's people and coding agents.
Use it to coordinate agent swarms and build software factories: agents claim tasks, track state with
labels, report what they changed, and wait for answers from people or other agents" (docs/board).

- It is **headless**. There is no kanban UI. You view it with `npx @vercel/board inspect`, a local
  viewer of "activity across channels and threads in real time" (blog).
- It is **hosted on Vercel**. It is free while experimental, and "Board stores its data in the
  United States" (docs/board). The SDK and CLI are open source, and "local() keeps a board in SQLite
  on your machine" for development (docs/board).
- It works with **any harness**: "Claude Code, Codex, Pi, OpenCode, eve, fx, Mastra, and LangChain
  can collaborate as if they were a single harness" (blog).

## How it works

**Data model.** The data model is "Team → Board → Channel → Thread → Message", plus "Grants" and an
"Event log" (docs/board). The parts:

- "A label is a key=value pair on a message, such as state=open, that people, scripts, and agents
  filter on and wait for."
- "A task is a thread with a state the board keeps. An agent claims a task, works on it in the
  thread, and completes it."

**Tasks** (docs/board/concepts/tasks):

- Task states: "The thread's root says what to do, its replies are the work log, and the board keeps
  the task's state." The states are `waiting`, `ready`, `claimed`, `blocked`, `completed`, `failed`
  and `canceled`.
- Leases: "A claim is a lease ... A lease lasts up to 5 minutes ... When a lease runs out, the task
  is ready for another worker to claim." Also: "A worker that stalls past its lease can't settle a
  task that another worker has since claimed."
- Conflicts: "When two workers claim the same task, one claim succeeds. The other fails with
  `task_claimed`."
- Dependencies: "Pass `--needs <id>` ... to make a task wait until those tasks complete ...
  Completing a task readies the tasks that waited only for it." A JSON plan file creates a
  dependency graph in one command: `tasks create work --file plan.json --idempotency-key cve-123`.
- Holds for a person: "`tasks block <id> "<reason>"` holds a task until a person answers ...
  `--kind` says what the hold is for."
- Run a command as the task: "`tasks run` claims a task, runs a command, and settles the task by how
  the command exits." Exit 0 completes the task, and the claim is renewed "at a third of the lease."

**Wake-ups.** "You can configure a watcher to run agents when a new reply is posted or a label
changes ... On Vercel, matching events wake your deployment, so no process needs to stay running"
(blog). "Agents can also schedule follow-ups with `vercel board schedule` ... it can remind itself
to check CI in 5 minutes" (blog).

**Sync.** Sync covers Slack and Linear in both directions, and GitHub inward only by default. "Sync
keeps GitHub's state on the thread's root as labels, so an agent can wait on GitHub without polling
it": `pr=owner/repo#123`, `state=draft|open|merged|closed`, `review=approved|changes_requested`,
`head=<sha>` (docs/board/concepts/sync). "A task's state doesn't sync" (same page).

**Structured data and access control.** Messages can carry data validated against a registered
schema, such as `security-finding@1` (blog). Grants are set per channel (`--can
'security/=read,post'`). `sandboxPolicy()` gives a Vercel Sandbox access to the board "with no
credential inside the sandbox" (blog).

**Swarm pattern.** The swarm guide (docs/board/guides/agent-swarm) splits the work between an owner
(a person), one lead agent that "never does the work itself", and workers, "one per task", which
include reviewers. Run unattended, a cron route starts a sandbox for each ready task, "up to a pool
size" (`POOL_SIZE = 4`). The guide also says "The board is the only state." Its rules include:

- "A completed task is a claim, not proof."
- "A question doesn't hold a worker. A worker that needs an answer blocks its task and stops, and
  frees its place in the pool."

## Is it related to what we build?

Yes, closely: it solves the same problem. Both put a shared task store between a person, a lead
agent and a pool of coding agents. Pull requests settle the work, and the pool is capped at 4 in
both (their example `POOL_SIZE = 4`, our `workers.cap` (4), `docs/workers/README.md:60`).

The two are built differently:

- **Board** is a hosted message bus with no UI. Agents pull work from it.
- **Dashboard** is a local desktop app. A person drives a kanban board, and the app pushes cards
  into worktrees and panes it owns.

## Overlap, with examples

| Concept | Vercel Board | Dashboard |
|---------|--------------|-----------|
| Task store with a CLI that agents write through | `vercel board tasks complete <id> "..."` | `node "$DASHBOARD_BOARD" comment <id> "..."`; a hook refuses direct edits of card files (`docs/board/README.md:295`) |
| Task states / columns | waiting, ready, claimed, blocked, completed, failed, canceled | Backlog, Todo, Ship, Doing, Review, Done, Cancelled (`docs/board/README.md:1`) |
| Work log on the task | thread replies | the card's comment trail |
| Pull request state drives the task | sync puts labels on the root, such as `state=merged` and `review=approved`, and agents `wait` on them | the app asks `gh pr list --head <branch>`; open moves the card to Review, merged to Done, closed to Doing (`docs/board/README.md:129-145`), and a glyph shows ◌/✗/✓/●/◆ |
| A capped pool with a queue | cron route, `POOL_SIZE - claimed.length` | `pane start` answers `queued q7, 1st: 4 running, the cap is 4` (`docs/workers/README.md:99`) |
| Review as a separate step | a reviewer task with `--needs` on the fix | a move into Review runs `/pr-loop` in its own worktree (`docs/ship/README.md:1`) |
| Main/lead hands work out without doing it | the "lead" role | the project's main session dispatching into worker panes |

## What Board does that we do not

1. **Leases on claims.** A worker that crashes or hangs gives its task back after 5 minutes, and its
   late `complete` fails with `claim_lost`. Example: a worker pane's Claude hangs on a dead network
   call. On Board the task is ready again in 5 minutes. With us, the card sits in Doing and the pane
   still counts against the cap of 4 until someone notices and releases it.
2. **Dependencies between tasks.** `--needs` and a plan file create a graph that readies itself.
   Example: "migrate the schema" then "update the API" then "update the UI". On Board the second
   becomes `ready` the moment the first completes. With us, subtasks are only a parent badge and a
   progress bar (`docs/board/README.md:28`). Main has to remember to ship the second card after the
   first merges.
3. **Blocked frees the slot.** "A question doesn't hold a worker." The worker blocks the task and
   exits. Example: we count a worker "blocked on a question" as one of the 4 running
   (`docs/workers/README.md:99`). Three workers waiting on you, plus one busy, stalls the whole
   queue.
4. **Event-driven wake-ups and self-scheduled follow-ups**, through watchers and `board schedule
   --in 5m`. Example: an agent reminds itself to check CI in 5 minutes. We poll `gh` every minute
   and on report, and the review worker waits on CI in the background.
5. **Multi-tool, multi-person, multi-machine.** Slack and Linear sync both ways, and grants control
   access per channel. Any harness can take part. Example: a teammate files a bug in Slack and an
   agent picks it up. Our board is one person's, in their repository's git.
6. **Structured payloads** validated by a schema, and **idempotency keys** on creates.
   Example: an agent retries a timed-out `tasks create`, and the same key creates nothing twice.
7. **Hosted and unattended.** Workers run in sandboxes started by a cron route with no laptop on,
   and no credential enters the sandbox.

## What we do that Board does not

1. **A kanban UI you drive from the keyboard**, with search, undo and a which-key strip. Board is
   headless; its viewer shows threads, not columns. Example: Shift+arrow moves a card into Ship and
   an agent starts. On Board you write a `tasks create` command or code.
2. **Owns the whole run of the agent.** It makes the branch and worktree, runs the frozen install,
   starts Claude in a pane, and resumes the conversation after a restart (`docs/ship/README.md:23`,
   `docs/workers/README.md:1`). Board says "You bring: the agents ... Where the agents run".
   Example: we ship a card and it is running in a pane with packages installed. On Board you write
   the sandbox route yourself.
3. **A review loop with merge built in.** `/pr-loop` runs review, fix and re-review rounds, waits
   for CI and optionally lands the PR on green (`docs/ship/README.md:1-70`). Board only gives you a
   reviewer task shape.
4. **Moves columns from the PR in both directions.** A PR closed without merging moves the card back
   to Doing, and a reopened PR counts as opened again (`docs/board/README.md:144-153`). Board's
   GitHub sync brings labels in, but "A task's state doesn't sync", so a lead has to act on them.
5. **Local and git-versioned.** The board is files in `.dashboard/board/`, committed to the default
   branch through `syncBoard` (`docs/board/README.md:229`). It lives with the code, works offline,
   and its history is in git. Board is hosted in the US only.
6. **GitLab** as a forge (`glab mr list`, `docs/board/README.md:134`). Board's sync lists GitHub,
   Slack and Linear.
7. **Terminal workspace around the board**: nvim, notes and a browser per project. Board is only a
   message store.

## Worth borrowing

1. **Blocked frees the pool slot.** Let a worker that is waiting on a question leave the cap. It
   would park its card with a "blocked: <question>" comment, or move to a Blocked column if one
   existed, and give up the pane. Answering the question re-queues the card. Example: three
   questions waiting no longer stop the fourth card from shipping.
2. **A heartbeat lease for panes.** If a worker pane has sent no output or report for N minutes, put
   it in a "stalled" state and say so to main, with a choice between release and re-queue. This is
   the local version of `claim_lost`, and it fixes the hung-worker example in item 1 of the previous
   section.
3. **`--needs` between cards.** A card that names cards it waits for stays queued in Ship until they
   reach Done. Merged already moves a card to Done, so the release hook exists. Example: ship all
   three migration cards at once; the second starts when the first merges.
4. **Agents schedule their own follow-ups** ("check CI in 5m") instead of holding a turn open. This
   matches their rule "Keep the lead's turns short ... Give anything slow to a worker," which
   applies to our main as well.
5. **Idempotency on `board add` and `board ship`**, so a retried command after a timeout does not
   make a duplicate card or a second worktree.

Not worth borrowing: hosted storage, grants and Slack sync. They solve a team problem the Dashboard
does not have, and they would give up the git-versioned local board.
