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
agent (workers-decision-8) and is called by main, with no door yet. The other
pane and project requests stay where they are and move into `src/main/actions/` when a
change touches them; `shipFlow` and `reviewSweep` stay and are called by the
actions. A conversion of every channel at once is a big diff that changes
nothing anyone asked for and breaks things nobody is testing; this way each
conversion rides with a change that needed it, and the registry is proven on
three actions first.
