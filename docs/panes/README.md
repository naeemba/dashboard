# Panes

A project's terminals: the main session in a column on the left and the worker
panes in a scrolling list on the right. Each pane is an xterm over a pty that
the pane host runs, a node process outside the app, so the shell outlives a
quit, a crash or an update (panes-decision-1). What a pane printed is read for
links, bells, a name and whether it is busy.

## On screen

What each screen does, in full. The help dialog keeps only a short
blurb for it; this is where the rest lives.

The project's main session on the left, full height, and its worker panes in a
list down the right. The manager has the same screen, last along its strip and
reached with the terminals key: its main is main-manager, working with its
workers in ~/.dashboard, where projects.yaml describes every project, and the
board key or a click on the strip leaves it.

Main is Claude Code drawn as a page rather than a terminal (the Claude screen's
keys in Ctrl+H are its own), started as soon as the project opens and told to
dispatch the tasks you give it — do this, review that, research the other — into
workers rather than run them itself. It does that with DASHBOARD_COMMAND, a
command every pane carries: run `node "$DASHBOARD_COMMAND" pane` to see what it
takes (DASHBOARD_SESSION, the older path to the same program, still works). Its
project words, `node "$DASHBOARD_COMMAND" project find <word>` and `project
list`, look up any project you describe in ~/.dashboard/projects.yaml — its
folder, site and deploys — by its name or another name it goes by; `project
init` writes a first one from the open and recent projects, and never over one
that is there; `project open <name>` and `project close <name>` open and close
one by that name exactly: close is refused while any of its panes is running
something, as the close key is, and otherwise asks nothing. `pane claim
--project <name>` opens a worker on that project's page instead, opening the
project if it is closed, and `pane list --all` lists the panes of every open
project.

A worker it starts runs in auto mode, ends by sending main a message, and says
so on its pane either way: a yellow edge while it waits on a permission, which
rings like a bell and raises a notification, and a green one when its turn is
over. Going to the pane clears the edge, and so does the worker getting back to
work. Main only runs a worker in, or closes, a pane it started or one with
nothing running in it.

The new-pane key, or the button at the right end of the title row, opens a plain
shell at the bottom of it. The close key, or the cross in a worker's corner,
closes it, asking first if something still runs in it; the fold key, or the
arrow beside the cross, folds it to its name so the others share its room, and a
click on the name or moving to it opens it again. The first focus key is main
and the next eight count down the list; past those, the down and up keys walk
it, and it scrolls to keep the pane you are in in sight.

The panes keep running while you are on another project or another view, so a
long job is still going when you come back. Ctrl+C in a pane is the shell's
interrupt, so off a mac copy and paste have keys of their own, listed in
Ctrl+H; a mac copies and pastes with Cmd as anywhere.

One of them at a time can be zoomed to fill the page and put back; while one is
zoomed the pane holding the keyboard is the one you see, so moving between panes
moves the zoom with you.

One of them can be running an agent in a worktree instead of the project's own
checkout — a card shipped into that pane — and the status bar names the branch
of whichever pane you are in whenever it is sitting in a worktree, the agent's
and the shell it leaves behind, so a command typed there does not land in the
wrong place. When the pane is running a Claude Code agent the status bar also
says what that agent has cost in tokens so far, read out of Claude Code's own
logs on this machine — nothing is asked of any server.

A pane says what is in it as well as its number. A program can name its own pane
by setting the terminal title — every shell does it on each prompt, and an agent
can be told to say what it is working on — and the name key names one yourself,
which beats the title and lasts across a restart. Leave the box empty to go back
to following the title. A title goes when the program that set it exits, so a
pane waiting on Enter to restart is back to its number. A long name is cut to
what the line has room for. The number stays in front of both, because the focus
keys are numbered.

A pane that rings the terminal bell to ask for you puts a pulsing red dot on its
project along the top, turns that name yellow, and raises a system notification
once if the window is behind something else. The status bar at the foot says
which pane. Clicking that notification brings the app forward on that pane.
Going to the pane clears it. A bell is checked a second later against what the
pane has on screen, so an agent that rings on its way past something and keeps
working is left alone.

The scrollback key takes you to the nvim screen with the pane you are looking at
open there as a file — the last 10000 lines it printed, scrollback and screen
alike, which is as far back as a pane remembers. The pane keeps running
meanwhile, and the file is a copy: editing it changes nothing in the pane it
came from.

A file path a pane prints — src/main.ts, or src/main.ts:42 with a line, :42:7
with a column too — underlines under the pointer, and clicking it opens that
file in this project's nvim at that line, in the window you were editing in
rather than a new tab. The file key does the same from the keyboard: it puts a
letter over every path on the pane's screen, the newest output getting a first,
and typing a letter opens that path; Escape, or any other key without a
modifier, puts the letters away. A relative path is looked for in the folder the
pane's shell is in now, then the folder the pane started in, then the project,
and a path that names no file there stays on this screen and says so in the
status bar. A path or web address cut onto a second row, by the terminal or by
an agent indenting the rest, is read whole from either row as long as the cut
falls after its first slash; one that only reaches the edge the pane had when it
was printed can take the first word of an indented row under it.

## Files

Folders: `src/main/panes/`, `src/shared/panes/`, `src/renderer/panes/`.

- Pane: `pane.ts`, `pane-actions.ts`, `pane-channels.ts`, `pane-layout.ts`,
  `pane-openers.ts`, `pane-reading.ts`, `pane-screen-copy.ts`, `pane-sends.ts`,
  `terminals.ts`, `jumps.ts`
- Shell and process: `shell.ts`, `process-tree.ts`, `shell-directory.ts`,
  `shell-directory-lookup.ts`, `working-panes.ts`, `free-pane.ts`, `waiting.ts`
- Pane host: `pane-host-protocol.ts`, `pane-host-server.ts`,
  `pane-host-entry.ts`, `pane-host-client.ts`, `pane-shell.ts`, `pane-shells.ts`,
  `adopted-pane.ts`, and `vite.pane-host.config.ts` at the root
- Links in output: `links.ts`, `wrapped-links.ts`, `print-widths.ts`
- Off screen: `paused-selection.ts`, which keeps xterm from redrawing a
  terminal it has paused; `.page[hidden]` in `index.css` is what moves a hidden
  page off screen so xterm pauses it

## Scenarios

- Given a pane you are not looking at, when it rings its bell, then the pane is marked and a notification click takes you to it.
- Given a link wrapped onto the next row, when you click it, then the whole link opens in the browser.
- Given a worker pane is focused, when you zoom it, then it fills the page, and zooming again puts the layout back.
- Given a pane on Linux, when you press Ctrl+Shift+C and Ctrl+Shift+V, then the selection is copied and the clipboard pasted.
- Given a project behind another one with its panes printing, when you come back to it, then every pane shows its latest output and scrolls back through everything it printed meanwhile.
- Given a pane link on the Claude screen, when you click it, then the page holding the pane comes forward with the pane focused, the way a notification click lands (see [chat](../chat/README.md)).
- Given a shell that has finished what it ran, when anything asks whether the pane is busy, then one answer says it is free.
- Given a worker pane running a job, when the app quits, crashes or is updated and opens again, then the pane comes back with the same shell, its screen and the job still running.
- Given a pane the pane host kept, when its project is closed or the pane is closed, then its shell is killed.
- Given no `node` on the login shell's PATH, when the app starts, then the status bar says shells die with the app this run, and the panes work as before.
- Given no pane host this run, when you close the window, then the quit question says every shell is killed.
- Given the installed app running, when a development build on the same user data starts, then the installed app keeps its panes and the development build runs its shells itself.
- Given the editor open, when the app quits, then nvim exits with it.

## Open questions

- A kept shell's `DASHBOARD_SOCKET` names the session socket of the run that
  started it, which is gone after a restart: `dashboard pane …` from that pane
  answers that the app has quit until the pane is restarted.
- A project not reopened after a restart leaves its kept shells running unseen
  until they exit or the machine restarts.
- An app whose protocol version differs from the running host's starts a host of
  its own; the old host's shells run on unseen.

- A job put in the background is invisible to the busy check; `runsAProgram`
  in `pane-reading.ts` says why.
