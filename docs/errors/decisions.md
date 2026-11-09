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
Closing the window on purpose asks first, and Force Quit is the one exit that
takes the shells without asking. A rejected promise from a five-second
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

## errors-decision-4: The bar's log line finds its Error through failureText

A failure reaches the status bar as a sentence — `Board not saved: EACCES` —
built around `failureText(error)` by some fifty callers, each through its own
`onError` or `report` callback that takes only the sentence. Passing the Error
along would change every one of those signatures and the wiring in
`renderer.ts` between them.

Instead `failureText` tells one listener (`whenFailureRead`) of every error it
reads. The status bar keeps the last eight reads, and when it logs a message it
attaches the newest read from the last second whose text is in the message.
Every caller reads the error and shows the sentence in the same breath, so the
second is generous; a read older than that was for something nobody showed (a
draft's JSON check) and does not lend its stack to a later message with the
same words. A thrown string or number adds no detail: the sentence already says
everything it had. The window's `error` and `unhandledrejection` go through
`failureNotice`, so they take the same path.

Main never sets the listener. Its failures reach the bar as sentences over
`failure:show` and are logged by the renderer without a stack; an IPC handler
that throws is logged by main itself, with the channel and main's stack
(`channels.ts`, `whenThrown`).

Watch for: the match is by text. A sentence that reshapes the text
(`firstLine(...)`) gets no stack, one shown more than a second after its read
loses it, and a generic text (`no reason given`) read by one failure can lend
its stack to another shown in the same second. Passing the Error through each
caller's `onError` removes the guess; it can land one caller at a time.

## errors-decision-5: A status-bar message goes by itself, and Escape is watched, not taken

Only the owner of a message could clear it, and many owners never did: a
refusal from the Claude screen (`Fix login has no conversation to show`) stayed
on the bar until the app restarted. So every message is given a lifetime when it
is drawn (`status-message.ts`): 8 seconds for a notice, 20 for an error, and
70 ms a character for a sentence long enough to need more. An owner that clears
its message still may; a newer message replaces the old one and its timer.

Escape clears it from anywhere, but the bar only watches the key: it is not a
row in the action table and it is never stopped. Taking it would cost nvim its
Escape whenever a message was showing, and close nothing a dialog expected to
close. A modified Escape is left alone (keys-rule-1).

A notice is logged now, as info under its owner, so a refusal seen once is still
on record. The worry that kept it out — every ship leaving a red line — does not
hold at info. Both kinds are logged at most once a minute per sentence
(`logsStatusMessage`), because with the message gone the bar can no longer
compare a repaint against what it shows.

An error while the window is not in front raises a desktop notification, once a
minute per sentence, with `errors.notify` to turn it off. The banner names no
pane, so a click only brings the window forward; it does not go through
project.focus, which needs one.

Watch for: a progress notice fades while its work goes on. A ship that takes a
minute says `shipping…` for 8 seconds, then nothing until it ends.
