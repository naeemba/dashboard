# Ship: a card, a worktree, a pane, an agent

Starting a card costs six steps today. You read the card, make a branch, decide
whether to stash what is in your checkout, open a pane, remember which folder it
is in, and paste the card's text into an agent. Every one of them is a place to
get it wrong, and the worst of them is silent: two cards in flight on one
checkout, standing on each other's changes.

This makes it one keystroke. You move a card into a new column called **Ship**.
The app makes the worktree, takes a pane you are not using, and starts an agent
in it with the card's id. From there the agent does the work, and it moves the
card on its own branch as it goes.

## The one rule everything follows

**The board on `main` says what is merged. Everything in flight lives on the
branch, with the code that earns it.**

A card is not in Doing on `main` because an agent started working — it is in
Doing on the *branch*, in the same commit range as the work. When the pull
request merges, the card's new column arrives with the code. Nothing claims
progress that is not there.

`create-task.js` is untouched by this and stays right: a new card goes to Todo,
and Todo is not a claim about work.

The cost of the rule is that your own board shows the card in Todo while an
agent is busy on it. A local record fixes that without breaking the rule — see
[The record](#the-record).

## Scope

- A fourth column, `Ship`, sitting between Todo and Doing.
- Moving a card into it creates a git worktree off a freshly fetched base
  branch, and starts `claude "/work-card <id>"` in a pane you have never typed
  into.
- A local `worktrees.json` records what is in flight: the badge on the card, the
  pane's label, and the cleanup list all read from it.
- `Ctrl+W` opens a list of every worktree, with a key to remove one.
- A `/work-card` skill, living in dotfiles rather than in this app, holds
  everything the agent is asked to do.

Not in scope, and each says why at the end: reading a worktree's own board to
show live progress, removing anything automatically, and naming panes properly.

## What you press

`Shift+Right` on a card in Todo. It lands in Ship. That is the whole gesture —
there is no confirmation dialog, because moving a card into a column named Ship
is already the explicit act.

Ship sits *before* Doing, so it is also on the road there. Moving a card from
Todo to Doing by hand is two presses of `Shift+Right`, and the first one ships
it. There is no way past Ship that does not go through it.

That is a real consequence and it is accepted rather than solved. Two things
make it survivable. Working a card by hand usually means the checkout already
has changes in it, and a dirty checkout refuses the ship before anything is
created. And when it does ship, `Ctrl+W` then `d` is two keystrokes: the
worktree goes, the entry goes, and the pane is yours again.

The alternative was a confirmation on every landing in Ship. It was rejected
because it puts a dialog in front of the gesture this whole design exists to
make cost one keystroke.

### When the checkout is dirty

The ship stops before anything is created, and the status bar names what is in
the way:

    4 files uncommitted — commit or stash them first

The card stays in Ship on screen. Nothing was fetched, no branch exists, no pane
was taken. Move it on to Doing, or move it back to Todo, or clean the checkout
and move it out and back in.

`.dashboard/board.json` is the one file exempt from that check. The app owns it,
rewrites it on every keystroke, and is about to put it back to `HEAD` anyway.
Counting it would mean the ship refuses itself.

## What the app does

In order. Each step's failure stops the flow, leaves everything before it as it
was, and reaches the status bar naming the step.

1. **Put board.json back.** `git checkout -- .dashboard/board.json`. This undoes
   the Ship move you just made on `main`, and any `Ship` column the app inserted
   on read. The card's id is already held in memory, so nothing is lost by
   throwing the file away.

2. **Find the base branch.** `origin/HEAD`, then `origin/main`, then
   `origin/master`. The same three-step guess `create-task.js` makes, and for the
   same reason: `origin/HEAD` is not always set.

3. **Fetch.** `git fetch origin <base>`. Then, only when the checkout is sitting
   on `<base>` and the fast-forward is clean, `git merge --ff-only origin/<base>`
   so your own checkout is current too. A checkout on some other branch is left
   alone — the worktree is made from `origin/<base>` either way, so it does not
   need the local branch to have caught up.

4. **Name the branch.** The card's title, lowercased, non-letters collapsed to
   single hyphens, trimmed to 48 characters: `Panes name themselves` becomes
   `panes-name-themselves`. If a branch or a worktree of that name already
   exists, four characters of the card id are appended —
   `panes-name-themselves-fc2b`. A title that slugifies to nothing falls back to
   `card-<four characters of the id>`.

5. **Make the worktree.**

       git worktree add -b <branch> ../<project>.worktrees/<branch> origin/<base>

   Beside the project, never inside it. Nothing to add to a `.gitignore`, nvim
   and ripgrep in the real checkout never walk into it, and a delete under
   `dashboard.worktrees/` cannot reach `dashboard/`.

6. **Move the card, on the branch.** In the worktree: read its board.json,
   insert a `Ship` column if it has none, move the card there, write it, and

       git add .dashboard/board.json
       git commit -m 'board: ship "<title>"'

   This is the only board write that belongs to a branch. The agent makes the
   rest.

7. **Write the record**, with no pane on it yet. A worktree that exists on disk
   is always recorded, from the moment it exists. An orphan worktree that
   nothing knows about is the exact thing that piles up unseen, and it is also
   what would let the same card be shipped twice into two branches.

8. **Take a pane**, and put its number on the record. The lowest-numbered pane
   in that project you have never sent a keystroke to. Its entry in
   `terminalCommands` is retargeted at the worktree directory with the agent's
   command, the old pty is killed, and it respawns.

   If every pane has been typed into, the flow stops with

       every pane in dashboard is in use — free one and ship again

   The worktree stays, and so does its record — with no pane. The card's badge
   reads `shipped · panes-name-themselves · no pane`, and shipping that card
   again picks up the worktree that is already there instead of making a second
   one. That is the one case where a re-ship is allowed rather than refused.

The board view then re-reads board.json — which is `main`'s again, with the card
back in Todo — and draws it with its badge.

## The record

`worktrees.json` in `app.getPath('userData')`, beside `session.json` and
`recents.json`:

    {
      "entries": [
        {
          "cardId": "fc2bf7b0-...",
          "title": "Panes name themselves",
          "projectPath": "/Users/sharp/workspace/personal/dashboard",
          "branch": "panes-name-themselves",
          "worktreePath": "/Users/sharp/workspace/personal/dashboard.worktrees/panes-name-themselves",
          "pane": 2,
          "startedAt": "2026-09-10T09:14:22.104Z"
        }
      ]
    }

Local state about local checkouts. It is never in git, so it can never conflict,
and like the session and the recents it is a convenience: a missing or damaged
file means nothing is recorded, not that the app fails to start.

It earns its place three times.

**The card says it is in flight.** A shipped card draws
`shipped · panes-name-themselves · terminal 3` under its title. Without it the
card sits in Todo looking untouched — you ship "Panes name themselves" at ten,
open the board at eleven to pick your next task, see it in Todo, and ship it
again. Second worktree, second branch, second agent, same card. With it, the
second ship is refused and says where the first one is.

**The pane says which checkout it is on.** The status bar reads
`terminal 3 · panes-name-themselves`. Five panes all reading `terminal 3` with
two of them in worktrees is how a command lands in the wrong checkout. This is a
narrow slice of the "Panes name themselves" card — enough to make this one safe,
and no more.

**It is the cleanup list.** See below.

An entry is removed when its worktree is removed, and dropped on read when its
worktree path no longer exists — a worktree deleted with `git worktree remove`
by hand must not leave a card marked as in flight forever.

## The agent's half

The pane runs, through a login-and-interactive shell so `claude` gets the PATH
you have:

    claude "/work-card fc2bf7b0-1234-..."

That is everything the app passes. The instructions live in
`~/.claude/commands/work-card.md`, in dotfiles, so rewording them does not mean
rebuilding the app. The skill:

- Reads the card out of the worktree's own `.dashboard/board.json` by id — title,
  notes, priority, parent, subtasks.
- Moves it to Doing and commits that on its own.
- Does the work, runs `npm test`, `npx tsc --noEmit`, `npx eslint .`, then
  `/simplify`.
- Commits, pushes, opens the pull request with `gh`.
- Moves the card to Done, records the branch and the pull request number on it,
  commits and pushes.
- Never touches `main`, and never touches the board outside its own worktree.

## Cleaning up

`Ctrl+W` opens an overlay:

    Worktrees (3)

      dashboard  panes-name-themselves    4d   clean   terminal 3
      dashboard  fix-picker-crash        11d   DIRTY   —
      api        bump-deps                2h   clean   terminal 5

    Enter goes to its pane.  d removes it.  Escape closes.

`d` asks first. A dirty worktree asks a second time and names the files, because
the changes in it exist nowhere else.

An overlay rather than a section on the manager page, for a reason written down
in `CLAUDE.md`: on the manager page a bare `d` is a letter that can no longer
reach a waiting pane's shell. Inside an overlay no pane can receive a keystroke,
so bare keys are free there. The overlay reads `event.key` for itself, so it
opens with `if (isModified(event)) return;` like every other dialog.

Nothing is removed automatically. A worktree whose branch merged is still a
folder you might have something in.

## Where the code goes

    ship.ts                 the decisions, with ship.test.ts
    worktree-store.ts       worktrees.json, with worktree-store.test.ts
    main.ts                 runs git, retargets the pane
    board.ts                Ship joins the default columns
    board-view.ts           notices the Ship landing, draws the badge
    shell.ts                agentArguments, beside editorArguments
    worktree-view.ts        the Ctrl+W overlay
    preload.ts              three new channels
    actions.ts, help.ts     the key, and blurbs that tell the truth

Nothing goes in `renderer.ts`. It is 744 lines and the rule says a file already
over the limit does not get longer.

### ship.ts — the decisions

Every branch in this feature that is not Electron's, in one module with a test
beside it, the way `session.ts` and `waiting.ts` already are:

    branchNameFor(title, cardId, taken)   the slug, the fallback, the dedupe
    worktreePathFor(projectPath, branch)  the sibling folder
    freePane(typedIn, count)              lowest never-typed pane, or null
    blockingChanges(porcelain)            dirty files that are not board.json
    shipColumnIndex(board)                where Ship is, or where to insert it

`blockingChanges` is the predicate the refusal and its message both read, so the
list on screen cannot say one thing while the flow refuses on another — the rule
this repo already applies to `hasSubtasks` and `isFontSize`.

### main.ts — the git

`worktree:create`, `worktree:list` and `worktree:remove`, in `<noun>:<verb>`
form like every other channel. Main runs `git` with `execFile`, never a shell,
so a card titled with a quote cannot become a command.

Every git call is awaited, never `execFileSync`. Main is the single process
every pane's bytes flow through, and a `git fetch` on a slow network takes
seconds — run it synchronously and all five shells stop painting until it
returns, which reads as the app having hung. The same reasoning the quit dialog
is built on: nothing in main blocks.

The handlers stay inline and untested, under the exemption already written down
for the quit guard: what could break in them is Electron's and git's plumbing,
and a test of those is a test of mocks. The decisions they call into are in
`ship.ts`, which is tested.

### The Ship column on an existing board

Every board that exists has three columns. `parseBoard` inserts an empty `Ship`
column after the first when the board has none, so an existing project gets it
without anyone hand-editing a file. It is idempotent and it is empty, so it costs
nothing to a project that never ships a card.

The insertion makes board.json dirty the moment a board is read. That is why
step 1 restores the file rather than merely undoing the move, and why board.json
is exempt from the dirty check — without both, the first ship after this lands
would refuse itself over a column the app had just added.

## Errors

Every failure names its step and leaves the world as it found it.

| What happens | What you see |
|---|---|
| Files uncommitted | `4 files uncommitted — commit or stash them first` |
| No network for the fetch | `could not fetch origin — check the network` |
| Base branch cannot be worked out | `cannot tell which branch on origin is the main one` |
| `git worktree add` fails | The git error, verbatim, after `worktree not created:` |
| Every pane typed into | `every pane in dashboard is in use — free one and ship again` |
| The shell or `claude` is missing | The pane shows `[exited 127]`, as any dead pane does |

The card stays where the failure left it. A worktree that got made is always
recorded, even when the steps after it failed, so nothing exists on disk that
the `Ctrl+W` list cannot show you and remove.

## Testing

`ship.ts` and `worktree-store.ts` get the tests, and they are where the branches
are:

- A title with punctuation, a title in Persian, a title that slugifies to
  nothing, and a title longer than 48 characters.
- A branch name already taken, and taken twice.
- `freePane` with none typed in, some typed in, and all typed in.
- `blockingChanges` with board.json alone, board.json plus another file, a
  rename, and an untracked file.
- `shipColumnIndex` on a three-column board, a four-column board, and a board
  where someone renamed a column.
- `worktree-store` parsing a missing file, a damaged file, an entry with no
  `worktreePath`, and an entry whose folder has gone.

`board.ts` gains cases for the inserted column. Nothing tests `git` itself.

## Deliberately left out

**Showing the card in Doing while the agent works.** Each worktree has a
board.json on disk at a path the record already holds, so the app could read it
and draw the card in the column the branch has it in. It is cheap and it is the
natural next step. The badge already stops the double-ship, which was the real
failure, so this gets a `ponytail:` comment and a card of its own.

**Removing anything on its own.** Pruning merged branches at launch means
deleting folders while you were not looking, and a squash-merged branch does not
read as merged.

**Naming panes properly.** This takes the slice it needs — a pane in a worktree
says which branch — and leaves the rest to its own card.

## Two costs, accepted knowingly

**Two pull requests in flight will usually conflict in board.json.** Both move a
card into the Done column, and both insert at the same place in the same array.
The conflict is visible, it is in one file, and you resolve it when you merge the
second. The alternative — keeping board moves off the branch — was considered and
rejected: it breaks the one rule this design is built on.

**"Never typed into" is a guess about which pane is free.** A pane running a
startup command you never typed in reads as free, and after the app restarts
every pane reads as free, because the shells are new. Both are true statements
about a pane nobody has touched; neither is a statement about what is running in
it. Knowing that needs shell integration this app does not have.
