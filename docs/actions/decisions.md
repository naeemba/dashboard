# Actions: decisions

Settled questions. Read the entry before re-litigating it.

## actions-decision-1: One move action and a table

**Every move goes through card.move, and what entering a column means is one
table, `columnEntry`.** Before, a ship started only from a gesture on the board
(`startsShip`, then `bridge.shipCard` and main's `shipFlow`), `dashboard board
move <id> Ship` only wrote the card file, and the review loop started from the
sweep's five-second poll alone. The same move meant three things depending on
who made it: drag a card into Ship and an agent starts; type the command and the
card sits in Ship with nothing running and nothing saying why. One action and
one table make the column mean the same thing from every door; a new door or a
new column is a row in the table and a test, not a fourth copy.

## actions-decision-2: Actions live in main

**The action logic is in `src/main/actions/`; the renderer and the command only
ask.** Main already holds what a ship and a review need — the worktree records,
the panes, git, the board writes — and app-rule-2 keeps the renderer from
importing any of it. Putting the decision in the renderer left the command
unable to reach it; putting it in the command left the screen unable to. Main is
the one place both reach: the screen over IPC, the command over the session
socket the `pane` and `project` nouns already use, which starts the app when
none answers.

## actions-decision-3: Converted one at a time

**Only card.move, card.ship, card.review and pane.dispatch are actions so
far.** pane.dispatch came with the change that needed one start for every pane
agent (workers-decision-8). Main calls its run, `startPane`, directly; the
action and its parser wait for a door. The other
pane and project requests stay where they are and move into `src/main/actions/` when a
change touches them; `shipFlow` and `reviewSweep` stay and are called by the
actions. A conversion of every channel at once is a big diff that changes
nothing anyone asked for and breaks things nobody is testing; this way each
conversion rides with a change that needed it, and the registry is proven on
three actions first. Its "when a change touches them" is replaced by
actions-decision-4.

## actions-decision-4: Every change goes through an action, one noun at a time

**A change to app state is an action, `src/main/actions/<noun>/<verb>.ts`, and
every door calls it; the move is one card per noun, in the order
`inventory.md` gives.** This replaces actions-decision-3's "when a change
touches them". Waiting for a change to need it left five ways to start an agent
in a pane and only one choosing screen or terminal (workers-decision-8), and two
of them still type `claude --resume` into a shell. Converting everything in one
card was weighed again and rejected for the reason actions-decision-3 gives;
one noun per card keeps each diff to one part of `main.ts`, in an order where
none waits on another. Until a noun's card lands, its bypasses are named in
`bypasses.test.ts`, so they can shrink and cannot grow (actions-rule-1).

## actions-decision-5: A resume is the pane's process, never typed into a shell

**Every resume, the restart's and the drawer's, is Claude Code started by
pane.dispatch as the pane's process.** Typed into a shell, a resume had no
worker hooks, no agent-start line in the log, and the pane read as a plain
shell for the first sweep, so a ship could pick it and the sweep could take its
folder away. The cost: exiting that Claude leaves an exited pane rather than a
prompt, and Enter gives a shell, as it does after a ship's agent exits. The
restart's resumes report a failure on the held failures list rather than
failing the project's open, and one that fails no longer stops the panes after
it from coming back.

pane.claim and pane.release are bound by the session command rather than in
`pane-actions.ts`: what they decide is read off its ledger of who claimed and
ran each pane, and moving the ledger out would give one map two writers.

## actions-decision-6: The dialog's removal waits on the project's queue

**worktree.remove runs the dialog's and `pane release`'s removals on the
project's git queue, the one ships and reviews hold; the review's runs in the
queue it already holds.** Before, `d` in the worktree dialog ran `git worktree
remove` straight away, so a removal pressed while a ship of the same project
was making its worktree could land on git's index lock and fail in git's own
words. The cost: `d` waits for a running ship's fetch before it answers. The
queue is not re-entrant, so a door that holds it already is named in
`removalOf` rather than queued again, which would wait on itself.

## actions-decision-7: A conversation has one name, written from either door

**session.rename writes the transcript's title and the drawer row's label
together, from /rename and from the drawer's F2.** Before, /rename wrote only
the title and F2 only the label, so a conversation renamed in the drawer still
showed its old name in /resume, and the other way round. The drawer finds the
row by the conversation's id in any project, since ids are UUIDs. The cost: a
row whose transcript was never written (a pane closed before Claude started)
takes the label, and the answer says /resume keeps the old name rather than
reading as nothing renamed.
