# Errors: decisions

Settled questions. Read the entry before re-litigating it.

## errors-decision-1: Why the refusal rule exists

It happened before `isFontSize` existed: `parseSettings` held its own copy of
the 6-to-72 range. A size the settings screen accepted was silently discarded
the next time the file was read, with nothing on screen saying why.

`withoutShipped` is the same idea one step over. It decides what a line has to
be before it belongs in settings.json, and both writers ask it — the save and
the launch tidy. Add a `scrollback` setting that ships as 1000, teach only the
save to leave it out, and an old file holding `"scrollback": 1000` is never
tidied. When the shipped default moves to 5000, that person stays on 1000.

## errors-decision-2: An unreadable worktree record stops the launch

`worktrees.json` cannot be read — EMFILE, EIO, a permissions change. The app
shows a box naming the file and exits. It does not open with an empty list.

Carrying on was considered and rejected. An empty list is not a safe fallback
here, because the launch prunes it and writes it back: the emptiness goes over
worktrees that are still on disk, they drop off Ctrl+W, and shipping one of
those cards again makes a second branch and a second folder beside the first.
Making it safe takes three new branches — skip every write for the run, say so
on the worktree list instead of "nothing shipped", and refuse a ship that would
record nothing — and each one missed puts the orphan back.

A refused launch costs nothing but the launch. No shell exists yet, no project
is open, and nothing is in flight inside the app, so there is no work to lose:
you open it again. If the failure is permanent the box names the file, which is
the one thing needed to fix it by hand.

This is not how the board answers the same failure, and that is on purpose.
`readBoard` throws into an IPC handler with a window already up, so the message
reaches the status bar and the rest of the app keeps working. There is no status
bar at launch.

## errors-decision-3: A failure nothing caught keeps the app running

An uncaught exception or a rejected promise nobody handled reaches the main
process. The message goes on the status bar and every shell keeps running.

Node's own answer is to end the process, and for most programs that is right:
nobody knows what state is left, so stop. Here it is the worst outcome there is.
Every pane is a shell that exists only inside this window — an `npm test`
halfway through, a deploy, an agent mid-card — and none of it comes back.
Closing the window on purpose asks first, and CLAUDE.md calls Force Quit the one
exit that takes the shells without asking. A rejected promise from a five-second
timer must not be a second one.

That is the opposite of what the same failure costs at launch, and on purpose.
Before a window has ever opened there is no shell to lose and nowhere to print,
so an uncaught failure there gets a box and an exit — the same answer the
worktree record gets (errors-decision-2), for the same reason.

A failure somebody *did* catch is a third thing again. It is caught where the
cost is known, so the launch can go on without that one part: a `.env` that will
not load costs the settings in it and nothing else, and the app opens with a
line on the bar saying which file. A failure that reaches the last resort says
nothing about what still works, which is why it does not get that choice.

Watch for: the bar holds one line. A thing that fails on every tick writes over
whatever was there, every tick.
