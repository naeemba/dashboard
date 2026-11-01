# Drawer: decisions

Settled questions. Read the entry before re-litigating it.

## drawer-decision-1: What the drawer lists, and where its button is

**The button is in the title row, at the left of the tabs**, not in the page.
Closed, the drawer takes no room at all and the button is all there is of it.
Open, the drawer lies over the left of the page and never resizes the grid. Its
key, Ctrl+Shift+D, opens and closes it too (bare Ctrl+D is end-of-file in every
shell). The button is not on the manager page, which has no docs and no
sessions of its own.

**Sessions come from the app's own index, never from `~/.claude/projects/`.**
A worker in a card's worktree lands in another slug folder there and would be
missed. Every Claude the app starts gets an id the app chose, recorded before it
starts: `--session-id` on a worker's and a card agent's command line. Main's
conversation is recorded the moment the SDK names it (init, `/clear`,
`/resume`), through the same `remember` that keeps it for the next launch; the
SDK's own `sessionId` option would add nothing the index does not already have.
The index is `session-index.json` in the app's user data, keyed by project path,
because sessions are one person's and `board.json` is tracked. Labels are
`<project>-<n>`; F2 renames one.

**Last used** moves when the token sweep finds the session running, and when the
drawer resumes it.

**A resume is always a new worker pane**, so it is never typed into a busy one.
It is refused while the conversation runs anywhere the app can see — a pane, by
the sweep's reading, or the Claude screen — because two Claudes on one
conversation each write their own turns into it.

**No document pane.** The card waited on one built from the Claude screen's
markdown renderer; that pane was never built. A doc opens where a path a pane
printed opens, in the project's nvim, until it is.

Watch for: a Claude typed into a pane by hand is not an app launch and is not
listed. A sweep that has not run since a pane's Claude started does not know it
is running, so a resume in the first half minute is not refused.
