# Drawer: decisions

Settled questions. Read the entry before re-litigating it.

## drawer-decision-1: What the drawer lists, and where its button is

**The button is in the title row, at the left of the tabs**, not in the page.
Closed, the drawer takes no room at all and the button is all there is of it.
Open, it pushes the page aside (drawer-decision-2 replaced lying over it). Its
key, Ctrl+Shift+D, opens and closes it too (bare Ctrl+D is end-of-file in every
shell). The button is not on the manager page, which has no docs and no
sessions of its own.

**Sessions come from the app's own index, never from `~/.claude/projects/`.**
A worker in a card's worktree lands in another slug folder there and would be
missed. Every Claude the app starts gets an id the app chose, recorded before it
starts: `--session-id` on a worker's and a card agent's command line. Main's
conversation is reported from the session's own lifecycle: every init reports
its id (a resume of the remembered one included), and a `/clear` or the end of
the session reports none. Its first init adds its row; the SDK's own `sessionId`
option would add nothing the index does not already have.
The index is `session-index.json` in the app's user data, keyed by project path,
because sessions are one person's and `board.json` is tracked. Labels are
`<project>-<n>`; F2 renames one.

**Last used** moves when the drawer resumes a session, and when the token sweep
finds it running (a pane's, or main's while its session runs) and its last use
is five minutes old: moving it every half-minute sweep would rewrite the file
for an age no row can show. Main's init leaves an existing row alone.

**A resume is always a new worker pane**, so it is never typed into a busy one.
It is refused while the conversation runs anywhere the app can see — a pane, by
the sweep's reading, or the Claude screen — because two Claudes on one
conversation each write their own turns into it. On the Claude screen means the
conversation its session runs now, or the one it will resume on the next
prompt (`chat-sessions.json`, read at launch and kept as it changes). Main
resumes that one without asking, and two windows leave it running nowhere yet:
between a project opening and its session's init, while the SDK loads, and
after main's session ended (a crash, say) and was not restarted, when the next
prompt resumes it. The reverse holds too: the Claude screen's `/resume` refuses
a conversation a worker pane runs, such as one of main's older ones the drawer
resumed into a pane. Both ask `stillRunning` in `session-index.ts`.

**No document pane.** The card waited on one built from the Claude screen's
markdown renderer; that pane was never built. drawer-decision-2 opens a doc in
a viewer instead.

Watch for: a Claude typed into a pane by hand is not an app launch and is not
listed. A sweep that has not run since a pane's Claude started does not know it
is running, so a resume in the first half minute is not refused.

## drawer-decision-2: Push the page, a tree of docs, a viewer rather than a pane

From using #161. Lying over the page hid the left of main's pane, the one the
drawer is opened beside, so **the open drawer pushes the page to its right**:
every page after it in `#pages` starts where it ends, and the panes are measured
again on opening and closing, the way a window resize measures them. A pane
measured once at the new width is a shell told its real size, not a full-width
terminal drawn in a narrower box.

**The docs are a tree**, closed folders until opened, because a flat list of
every file under docs/ was most of the drawer before a session showed. The
filter still searches every file, flat and by whole path, so finding a doc never
means opening folders first. Left and Right walk the tree only with the filter
empty; with text in it they belong to the caret. Opened folders are remembered
while the app runs, not across a restart.

**A doc opens in a full-screen viewer, not a pane**: the sheet the Claude
screen opens an image on (`viewerOverlay`), drawn by the Claude screen's own
renderer (`chat-markdown.ts`). Neither was copied. A pane would take a slot in
the grid for something read once and put away. The viewer's Edit row is its
only row and always highlighted, so Enter is Edit and Escape is close, the keys
every sheet already answers.

**The renderer was left as strict as the Claude screen needs it.** It shows an
image only carried inline and never reads the disk, so main reads a doc's
relative images, from inside the project only, and sends them beside the text
as data URLs, keyed by the address the doc gives each (`imageUrls` in
`docs-list.ts`); the renderer swaps an image's address for its data URL only
where marked reads an image, so image syntax shown as code stays as written. The read itself is
refused for any file not under the project's docs/ (`isDoc`), so the channel is
not a way to read any file the app can. A relative link stays text: following
it would mean a second rule about which links the renderer keeps.

Watch for: an image over a few megabytes travels as base64 in the doc's text.
