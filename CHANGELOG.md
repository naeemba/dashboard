# Changelog

## v2.45.0 (2026-11-08)

### What's new

- settings.json has one writer: a settings.write action
- Tests leak temp folders into /tmp until it fills
- A Cancelled column for cards that will not be done
- Tell the user a newer release is out and update from the UI
- Closing a project fails: 'An object could not be cloned'
- Log entries carry the details an error needs: stack, cause, where it came from
- board move <id> Review on a worktree's board exits 1 after moving

### What's Changed
* Stop tests leaking temporary folders into /tmp by @naeemba in https://github.com/naeemba/dashboard/pull/244
* settings.json has one writer: a settings.write action by @naeemba in https://github.com/naeemba/dashboard/pull/243
* A Cancelled column for cards that will not be done by @naeemba in https://github.com/naeemba/dashboard/pull/245
* Tell the user a newer release is out and update from the UI by @naeemba in https://github.com/naeemba/dashboard/pull/246
* Send only pane index and name over projects:close by @naeemba in https://github.com/naeemba/dashboard/pull/247
* Log entries carry the details an error needs: stack, cause, where it came from by @naeemba in https://github.com/naeemba/dashboard/pull/248
* board: a move on a worktree's board is only a move, and exits 0 by @naeemba in https://github.com/naeemba/dashboard/pull/249


**Full Changelog**: https://github.com/naeemba/dashboard/compare/v2.44.0...v2.45.0

## v2.44.0 (2026-11-08)

### What's new

- One pane.dispatch action that every agent start goes through
- Every change goes through an action: inventory and plan for panes, projects, worktrees and the rest
- Every pane change goes through a pane action: dispatch's door, resume, claim, open, send, release, close, restore
- Every worktree change goes through a worktree action: make and remove
- release.sh dies silently on a GitHub blip and --resume refuses after the release commit
- Show a running workflow's progress on the Claude screen
- Change model, mode and effort by clicking them in the Claude screen's foot
- False 'stopped without sending you a report' after a worker that did report is released
- Every project change goes through a project action: open, close, focus
- Every session change goes through a session action: start, reset, resume, branch, rewind, rename

### What's Changed
* One pane.dispatch action that every agent start goes through by @naeemba in https://github.com/naeemba/dashboard/pull/233
* Inventory every state change and pin the rule that it goes through an action by @naeemba in https://github.com/naeemba/dashboard/pull/234
* Every pane change goes through a pane action by @naeemba in https://github.com/naeemba/dashboard/pull/235
* Every worktree change goes through a worktree action: make and remove by @naeemba in https://github.com/naeemba/dashboard/pull/236
* release.sh survives a GitHub blip, and --resume accepts the release commit by @naeemba in https://github.com/naeemba/dashboard/pull/238
* Show a running workflow's progress on the Claude screen by @naeemba in https://github.com/naeemba/dashboard/pull/237
* Change model, mode and effort by clicking them in the Claude screen's foot by @naeemba in https://github.com/naeemba/dashboard/pull/239
* Take back a false stop notice when main releases the worker by @naeemba in https://github.com/naeemba/dashboard/pull/241
* Every project change goes through a project action: open, close, focus by @naeemba in https://github.com/naeemba/dashboard/pull/240
* Every session change goes through a session action: start, reset, resume, branch, rewind, rename by @naeemba in https://github.com/naeemba/dashboard/pull/242


**Full Changelog**: https://github.com/naeemba/dashboard/compare/v2.43.1...v2.44.0

## v2.43.1 (2026-11-07)

### What's new

- One scrollbar and one width for every Claude screen

### What's Changed
* One scrollbar and one width for every Claude screen by @naeemba in https://github.com/naeemba/dashboard/pull/232


**Full Changelog**: https://github.com/naeemba/dashboard/compare/v2.43.0...v2.43.1

## v2.43.0 (2026-11-07)

### What's new

- Run workers as Claude screens by default
- project open starts the project's main session
- Split the new-pane button into New Terminal and New Claude
- One command to cut a release: scripts/release.sh and /release

### What's Changed
* Run workers as Claude screens by default by @naeemba in https://github.com/naeemba/dashboard/pull/227
* Start a project's main session on dashboard project open by @naeemba in https://github.com/naeemba/dashboard/pull/229
* Split the new-pane button into New Terminal and New Claude by @naeemba in https://github.com/naeemba/dashboard/pull/228
* One command to cut a release: scripts/release.sh and /release by @naeemba in https://github.com/naeemba/dashboard/pull/231


**Full Changelog**: https://github.com/naeemba/dashboard/compare/v2.42.0...v2.43.0

## v2.42.0 (2026-11-06)

### What's Changed
* Terminal dashboard v1 by @naeemba in https://github.com/naeemba/dashboard/pull/1
* Add Option+hjkl pane navigation and a Ctrl+S project picker by @naeemba in https://github.com/naeemba/dashboard/pull/2
* Open projects from a searchable list instead of a config file by @naeemba in https://github.com/naeemba/dashboard/pull/3
* Make Cmd+Backspace clear the shell's current line by @naeemba in https://github.com/naeemba/dashboard/pull/4
* Give the window Ghostty's header by @naeemba in https://github.com/naeemba/dashboard/pull/5
* Take dropped files as paths, open links, and run the checks in CI by @naeemba in https://github.com/naeemba/dashboard/pull/6
* Give each project three modes: terminals, nvim and a board by @naeemba in https://github.com/naeemba/dashboard/pull/7
* Fix the editor pane's PATH, ask before closing, reopen where you left off, and give board cards priority and a description by @naeemba in https://github.com/naeemba/dashboard/pull/8
* Ctrl+H lists the keys for the screen you are on by @naeemba in https://github.com/naeemba/dashboard/pull/9
* Give board cards subtasks by @naeemba in https://github.com/naeemba/dashboard/pull/10
* Settings: one file, one table, one screen by @naeemba in https://github.com/naeemba/dashboard/pull/11
* Mark a terminal pane that rings its bell by @naeemba in https://github.com/naeemba/dashboard/pull/12
* Make the waiting-pane notification actually appear by @naeemba in https://github.com/naeemba/dashboard/pull/13
* Ask the quit question without stopping the main process by @naeemba in https://github.com/naeemba/dashboard/pull/14
* Clicking a notification takes you to the pane that rang by @naeemba in https://github.com/naeemba/dashboard/pull/15
* A card carries its dates, its branch and its pull request by @naeemba in https://github.com/naeemba/dashboard/pull/16
* A first tab that is not a project by @naeemba in https://github.com/naeemba/dashboard/pull/17
* The manager page lists what wants you by @naeemba in https://github.com/naeemba/dashboard/pull/18
* One clamp, in one file, for every list by @naeemba in https://github.com/naeemba/dashboard/pull/20
* Text the app draws reads in the direction it is written in by @naeemba in https://github.com/naeemba/dashboard/pull/21
* manager: a waiting pane's last lines, and a key that answers it by @naeemba in https://github.com/naeemba/dashboard/pull/22
* manager: every open project's board, editable where it sits by @naeemba in https://github.com/naeemba/dashboard/pull/23
* settings: the file keeps what you chose, not what we shipped by @naeemba in https://github.com/naeemba/dashboard/pull/26
* Ship a card into its own worktree, with an agent in one of the project's panes by @naeemba in https://github.com/naeemba/dashboard/pull/27
* A command run across projects, and a named strip to reach it by @naeemba in https://github.com/naeemba/dashboard/pull/28
* manager: what each pane last printed, and how long ago by @naeemba in https://github.com/naeemba/dashboard/pull/29
* Run the command in a free pane of each marked project by @naeemba in https://github.com/naeemba/dashboard/pull/30
* Zoom the focused pane to fill the page, and back by @naeemba in https://github.com/naeemba/dashboard/pull/31
* Close a project from the manager list by @naeemba in https://github.com/naeemba/dashboard/pull/32
* A command line for the board, so agents can work it by @naeemba in https://github.com/naeemba/dashboard/pull/33
* Close the project you are on by @naeemba in https://github.com/naeemba/dashboard/pull/34
* Ctrl+` opens the focused pane's scrollback in nvim by @naeemba in https://github.com/naeemba/dashboard/pull/35
* panes: a name from the program in it, or one you type by @naeemba in https://github.com/naeemba/dashboard/pull/36
* worktrees: main says when the record changes, instead of the board asking by @naeemba in https://github.com/naeemba/dashboard/pull/37
* Ctrl with a digit: what macOS does with it, written down where defaults are picked by @naeemba in https://github.com/naeemba/dashboard/pull/38
* A card keeps a comment trail, written from the app and from the command line by @naeemba in https://github.com/naeemba/dashboard/pull/39
* Token usage per project, and per pane by @naeemba in https://github.com/naeemba/dashboard/pull/40
* board: move a card with the mouse by @naeemba in https://github.com/naeemba/dashboard/pull/41
* ship: git's output keeps the blank column an unstaged change starts with by @naeemba in https://github.com/naeemba/dashboard/pull/42
* A fourth mode: notes, one page of them per project by @naeemba in https://github.com/naeemba/dashboard/pull/43
* board: a read that fails is a failure, not an empty board by @naeemba in https://github.com/naeemba/dashboard/pull/46
* board: a board nobody read refuses the keys by @naeemba in https://github.com/naeemba/dashboard/pull/48
* A fifth column, Review: a finished card goes there and a pr-loop worktree carries its pull request to merged by @naeemba in https://github.com/naeemba/dashboard/pull/49
* Hold a modifier and see what it starts by @naeemba in https://github.com/naeemba/dashboard/pull/50
* The review pane merges the pull request instead of approving it by @naeemba in https://github.com/naeemba/dashboard/pull/51
* A pane is free when nothing is running in it by @naeemba in https://github.com/naeemba/dashboard/pull/52
* Clean up the numbers on the manager list and fill the empty page by @naeemba in https://github.com/naeemba/dashboard/pull/54
* One answer to whether a pane is busy, not three by @naeemba in https://github.com/naeemba/dashboard/pull/55
* A review that cannot take the worktree yet tries again, instead of giving up by @naeemba in https://github.com/naeemba/dashboard/pull/56
* Search cards on the board by @naeemba in https://github.com/naeemba/dashboard/pull/57
* Show the build version along the foot of the manager page by @naeemba in https://github.com/naeemba/dashboard/pull/58
* Notes mode on the manager page, kept in the home directory by @naeemba in https://github.com/naeemba/dashboard/pull/59
* A failed readWorktrees truncates worktrees.json on launch by @naeemba in https://github.com/naeemba/dashboard/pull/60
* Contain a failure so one broken part cannot take the app with it by @naeemba in https://github.com/naeemba/dashboard/pull/61
* A ship leaves main's board.json the way it found it by @naeemba in https://github.com/naeemba/dashboard/pull/62
* A board of the manager's own, kept in the home directory by @naeemba in https://github.com/naeemba/dashboard/pull/63
* Redesign the manager page: board counts, worktrees, recent activity, token trend by @naeemba in https://github.com/naeemba/dashboard/pull/64
* Manager page: name every column and every figure by @naeemba in https://github.com/naeemba/dashboard/pull/65
* Manager: a queue of what needs you, and a key to the next one by @naeemba in https://github.com/naeemba/dashboard/pull/66
* Manager lists every git worktree of each open project by @naeemba in https://github.com/naeemba/dashboard/pull/67
* Manager: cards for the date and weather, Bitcoin, Tether in toman and gold by @naeemba in https://github.com/naeemba/dashboard/pull/68
* Update dependencies to latest; Electron Forge 8 by @naeemba in https://github.com/naeemba/dashboard/pull/69
* Manager cards drawn as cards, with icons and a Persian date read the right way by @naeemba in https://github.com/naeemba/dashboard/pull/70
* Sign with a local certificate so folder access survives rebuilds by @naeemba in https://github.com/naeemba/dashboard/pull/71
* Draw every screen outside the panes as an app rather than a terminal by @naeemba in https://github.com/naeemba/dashboard/pull/72
* Copy and paste in a pane with Ctrl+Shift+C and Ctrl+Shift+V off a mac by @naeemba in https://github.com/naeemba/dashboard/pull/74
* Backlog column, board filter and a sort button by @naeemba in https://github.com/naeemba/dashboard/pull/73
* Open a file path printed in a pane in the project's nvim by @naeemba in https://github.com/naeemba/dashboard/pull/75
* Resume each pane's Claude session after a restart by @naeemba in https://github.com/naeemba/dashboard/pull/76
* Read a link wrapped onto the next row as one, whether the terminal wrapped it or the agent printed the rest indented by @naeemba in https://github.com/naeemba/dashboard/pull/77
* Measure a cut row against the width the pane had when it was printed, not the pane's width now by @naeemba in https://github.com/naeemba/dashboard/pull/78
* Strip the spaces a program wrote at the end of a row, so a path Claude Code cut is joined back whole by @naeemba in https://github.com/naeemba/dashboard/pull/79
* Add an application log and a log section in the manager by @naeemba in https://github.com/naeemba/dashboard/pull/81
* A second screen: connect one Dashboard to another's session by @naeemba in https://github.com/naeemba/dashboard/pull/82
* Claude screen: an Agent SDK session drawn as HTML by @naeemba in https://github.com/naeemba/dashboard/pull/83
* Main session that dispatches tasks into worker panes by @naeemba in https://github.com/naeemba/dashboard/pull/84
* Fix the worker layout from #84: fixed main pane, scrolling worker list, button and status row by @naeemba in https://github.com/naeemba/dashboard/pull/85
* Claude screen: fix what it got wrong, add slash commands, plan mode and /resume by @naeemba in https://github.com/naeemba/dashboard/pull/86
* Claude screen: model picker, full status line, dropped and viewable images by @naeemba in https://github.com/naeemba/dashboard/pull/87
* Claude screen: working line, flowing text, cleaner foot, any file dropped by @naeemba in https://github.com/naeemba/dashboard/pull/90
* Keep the main pane half the terminals view after a worker is zoomed by @naeemba in https://github.com/naeemba/dashboard/pull/92
* Make the project's main session the Claude screen by @naeemba in https://github.com/naeemba/dashboard/pull/93
* Claude screen: draw ! commands properly, keep tool names whole, copy code blocks by @naeemba in https://github.com/naeemba/dashboard/pull/94
* Claude screen: fold messages Claude Code injects into one line each by @naeemba in https://github.com/naeemba/dashboard/pull/95
* Close a worker pane, and fold one to give its room to the others by @naeemba in https://github.com/naeemba/dashboard/pull/96
* New-pane button in the title row; the chat lists running agents and tidies Claude Code's own messages by @naeemba in https://github.com/naeemba/dashboard/pull/97
* Add screenshots to the README by @naeemba in https://github.com/naeemba/dashboard/pull/98
* Show PDF attachments in the chat pane as a tile that opens in the built-in viewer by @naeemba in https://github.com/naeemba/dashboard/pull/99
* Give each feature a docs folder with its rules, decisions and history by @naeemba in https://github.com/naeemba/dashboard/pull/100
* Show Claude's suggested next prompt in the Claude screen's box by @naeemba in https://github.com/naeemba/dashboard/pull/101
* Fold long user messages in the Claude pane's thread by @naeemba in https://github.com/naeemba/dashboard/pull/102
* Show Claude's thinking in the Claude pane by @naeemba in https://github.com/naeemba/dashboard/pull/104
* Rewind the Claude pane to an earlier prompt: code, conversation or both by @naeemba in https://github.com/naeemba/dashboard/pull/106
* @ file autocomplete in the Claude pane's box by @naeemba in https://github.com/naeemba/dashboard/pull/103
* Effort level and ultrathink in the Claude pane by @naeemba in https://github.com/naeemba/dashboard/pull/105
* Stop or background a running task from the Claude screen's task strip by @naeemba in https://github.com/naeemba/dashboard/pull/109
* Open a subagent in the Claude pane to see its own steps by @naeemba in https://github.com/naeemba/dashboard/pull/107
* Search prompt history in the Claude pane, across conversations by @naeemba in https://github.com/naeemba/dashboard/pull/108
* Real line diffs for edits in the Claude pane by @naeemba in https://github.com/naeemba/dashboard/pull/110
* Timestamp and model on each message in the Claude pane by @naeemba in https://github.com/naeemba/dashboard/pull/115
* Branch the Claude screen's conversation with /branch by @naeemba in https://github.com/naeemba/dashboard/pull/112
* chat: /diff reviews every file Claude changed in the conversation by @naeemba in https://github.com/naeemba/dashboard/pull/111
* Show API retry and rate-limit notices in the Claude pane by @naeemba in https://github.com/naeemba/dashboard/pull/120
* /mcp in the Claude pane: server status, reconnect, disable and enable by @naeemba in https://github.com/naeemba/dashboard/pull/117
* Rename the conversation from the Claude screen with /rename by @naeemba in https://github.com/naeemba/dashboard/pull/122
* Queue a message sent while Claude is busy, shown grey until picked up by @naeemba in https://github.com/naeemba/dashboard/pull/114
* Edit the Claude pane's prompt in the project's nvim by @naeemba in https://github.com/naeemba/dashboard/pull/113
* chat: /btw side question kept out of the conversation by @naeemba in https://github.com/naeemba/dashboard/pull/118
* Readline kill and yank keys in the Claude screen's boxes by @naeemba in https://github.com/naeemba/dashboard/pull/127
* chat: answer MCP elicitation forms and sign-in links by @naeemba in https://github.com/naeemba/dashboard/pull/116
* Stash the Claude box's draft with Alt+S, Up brings it back by @naeemba in https://github.com/naeemba/dashboard/pull/123
* Show hook progress in the Claude pane by @naeemba in https://github.com/naeemba/dashboard/pull/124
* Draw TodoWrite as a checklist in the Claude pane by @naeemba in https://github.com/naeemba/dashboard/pull/126
* chat: /export the conversation to the clipboard or a file by @naeemba in https://github.com/naeemba/dashboard/pull/125
* Fast mode toggle in the Claude pane by @naeemba in https://github.com/naeemba/dashboard/pull/121
* chat: /copy [N] copies a whole Claude reply as markdown by @naeemba in https://github.com/naeemba/dashboard/pull/128
* Split chat-view.ts under the 600-code-line limit by @naeemba in https://github.com/naeemba/dashboard/pull/130
* Move src into process and feature folders by @naeemba in https://github.com/naeemba/dashboard/pull/131
* Move the types that cross processes into src/shared and split chat-rename.ts by @naeemba in https://github.com/naeemba/dashboard/pull/132
* Drop the 18 exports nobody outside their file uses by @naeemba in https://github.com/naeemba/dashboard/pull/133
* Spell out args as a full word in locals and parameters by @naeemba in https://github.com/naeemba/dashboard/pull/136
* Split board.test.ts into column, tree and remaining tests by @naeemba in https://github.com/naeemba/dashboard/pull/137
* Merge the two slug helpers in dispatch.ts and ship.ts by @naeemba in https://github.com/naeemba/dashboard/pull/135
* Lint the process boundaries between src/main, src/renderer and src/shared by @naeemba in https://github.com/naeemba/dashboard/pull/134
* Split renderer.ts under 600 code lines by @naeemba in https://github.com/naeemba/dashboard/pull/139
* Move worktree bookkeeping out of main.ts by @naeemba in https://github.com/naeemba/dashboard/pull/140
* Rename chat:commands and chat:sessions IPC channels by @naeemba in https://github.com/naeemba/dashboard/pull/141
* Build the image-size refusal from the limit it enforces by @naeemba in https://github.com/naeemba/dashboard/pull/143
* Keep written spaces in the file-link-open test buffer, as xterm does by @naeemba in https://github.com/naeemba/dashboard/pull/142
* Skip a dropped file with no path on disk instead of typing '' into the pane by @naeemba in https://github.com/naeemba/dashboard/pull/144
* Spell out args locals and parameters in test files by @naeemba in https://github.com/naeemba/dashboard/pull/147
* Rank the project picker, /model and /rewind with ranked by @naeemba in https://github.com/naeemba/dashboard/pull/146
* Answer the folder dialog refusal instead of throwing it by @naeemba in https://github.com/naeemba/dashboard/pull/149
* Rename the projects:recent IPC channel to recent-projects:read by @naeemba in https://github.com/naeemba/dashboard/pull/151
* Log screen help blurb reads the log caps from their constants by @naeemba in https://github.com/naeemba/dashboard/pull/152
* Rank /resume, the @ file list and the board search with ranked by @naeemba in https://github.com/naeemba/dashboard/pull/153
* One dashboard command with board and pane subcommands by @naeemba in https://github.com/naeemba/dashboard/pull/154
* Manager terminals: a main session and worker panes in ~/.dashboard by @naeemba in https://github.com/naeemba/dashboard/pull/155
* Manager terminals 1: ~/.dashboard/projects.yaml and dashboard project find/list by @naeemba in https://github.com/naeemba/dashboard/pull/156
* dashboard project init: a first projects.yaml from the open and recent projects by @naeemba in https://github.com/naeemba/dashboard/pull/157
* Claim a worker pane in any project by name, and list every project's panes by @naeemba in https://github.com/naeemba/dashboard/pull/158
* Manager terminals 5: open and close a project from the command by @naeemba in https://github.com/naeemba/dashboard/pull/159
* Update every dependency: Electron 45, TypeScript 7 by @naeemba in https://github.com/naeemba/dashboard/pull/160
* Drawer of a project's docs and Claude sessions by @naeemba in https://github.com/naeemba/dashboard/pull/161
* Drawer: push the panes aside, docs as a tree, read docs in a full-screen viewer by @naeemba in https://github.com/naeemba/dashboard/pull/162
* Drawer: an icon on every page, and on the manager the markdown under ~/.dashboard and ~/.claude by @naeemba in https://github.com/naeemba/dashboard/pull/163
* Keep the drawer open across a tab switch by @naeemba in https://github.com/naeemba/dashboard/pull/164
* Review every decision in the app from first principles by @naeemba in https://github.com/naeemba/dashboard/pull/165
* Profile the app and report what makes it slow or heavy by @naeemba in https://github.com/naeemba/dashboard/pull/166
* Merge docs/**/history.md with the union driver by @naeemba in https://github.com/naeemba/dashboard/pull/167
* Stamp the build's commit in its version instead of bumping on every card by @naeemba in https://github.com/naeemba/dashboard/pull/168
* Refresh button on each market card of the manager page by @naeemba in https://github.com/naeemba/dashboard/pull/169
* Move the board selection without rebuilding the whole board by @naeemba in https://github.com/naeemba/dashboard/pull/171
* Bind the remote host to localhost by default and compare tokens in constant time by @naeemba in https://github.com/naeemba/dashboard/pull/173
* Run the usage sweep on its own thread by @naeemba in https://github.com/naeemba/dashboard/pull/172
* Tell main when its worker finishes; link worker panes and list them from the Claude screen by @naeemba in https://github.com/naeemba/dashboard/pull/176
* Let pane shells outlive the app by @naeemba in https://github.com/naeemba/dashboard/pull/174
* Open a typed folder path from the project picker by @naeemba in https://github.com/naeemba/dashboard/pull/178
* Stop hidden projects laying out and painting their terminals by @naeemba in https://github.com/naeemba/dashboard/pull/179
* Add a Content-Security-Policy to the window by @naeemba in https://github.com/naeemba/dashboard/pull/181
* Show what fills the context window from the Claude screen's context meter by @naeemba in https://github.com/naeemba/dashboard/pull/180
* Cap each help dialog blurb at 60 words by @naeemba in https://github.com/naeemba/dashboard/pull/184
* Make Ctrl+C stop a flooding pane at once and spare main's core by @naeemba in https://github.com/naeemba/dashboard/pull/185
* Write the board as the change against a fresh read in main by @naeemba in https://github.com/naeemba/dashboard/pull/183
* Start a page's Claude CLI only when its screen is shown by @naeemba in https://github.com/naeemba/dashboard/pull/186
* Draw only the unsettled tail of a streaming Claude reply by @naeemba in https://github.com/naeemba/dashboard/pull/188
* Show whether the Claude prompt cache is warm, and for how long by @naeemba in https://github.com/naeemba/dashboard/pull/189
* Take the single-instance lock and write session.json atomically by @naeemba in https://github.com/naeemba/dashboard/pull/175
* Add a handwriting page to the notes by @sanabandi in https://github.com/naeemba/dashboard/pull/190
* Start and package on Windows by @sanabandi in https://github.com/naeemba/dashboard/pull/191
* Run CI on Windows by @naeemba in https://github.com/naeemba/dashboard/pull/197
* Start workers under Windows PowerShell by @sanabandi in https://github.com/naeemba/dashboard/pull/195
* End a session request at its newline, not at a half close by @sanabandi in https://github.com/naeemba/dashboard/pull/196
* Ship /create-task and its card program with the app by @naeemba in https://github.com/naeemba/dashboard/pull/199
* Install the create-task program as an executable by @naeemba in https://github.com/naeemba/dashboard/pull/200
* Move the project to pnpm with the hoisted linker by @naeemba in https://github.com/naeemba/dashboard/pull/201
* Keep the manager's section strip out of the keyboard by @naeemba in https://github.com/naeemba/dashboard/pull/202
* Pane commands stop waiting on an older app and refuse another build by @naeemba in https://github.com/naeemba/dashboard/pull/203
* Run the pane host on Windows over a named pipe by @naeemba in https://github.com/naeemba/dashboard/pull/204
* Drive the app from any terminal with the dashboard command by @naeemba in https://github.com/naeemba/dashboard/pull/205
* Give each card its own file so parallel pull requests stop conflicting on the board by @naeemba in https://github.com/naeemba/dashboard/pull/206
* Make pane links readable on the Claude screen and reachable from the keyboard by @naeemba in https://github.com/naeemba/dashboard/pull/208
* Stop waking main for a worker that only paused by @naeemba in https://github.com/naeemba/dashboard/pull/209
* Show YAML and JSON files in the doc drawer, formatted and foldable by @naeemba in https://github.com/naeemba/dashboard/pull/210
* Tell main at once when a worker is truly done, using the Stop hook's background_tasks by @naeemba in https://github.com/naeemba/dashboard/pull/211
* Count tool input and real output tokens in the Claude screen's working line by @naeemba in https://github.com/naeemba/dashboard/pull/212
* Refresh button and key for the Claude screen's usage meters by @naeemba in https://github.com/naeemba/dashboard/pull/213
* Open what is behind each row of the context popup by @naeemba in https://github.com/naeemba/dashboard/pull/214
* Agents key, each agent's conversation, and subagent tokens on the Claude screen by @naeemba in https://github.com/naeemba/dashboard/pull/215
* Import replaceFile from app/replace-file, not the board store by @naeemba in https://github.com/naeemba/dashboard/pull/216
* Run worker panes as Claude screens behind pane run --screen by @naeemba in https://github.com/naeemba/dashboard/pull/218
* One place for the board's actions: card.move, ship and review from the app and the command by @naeemba in https://github.com/naeemba/dashboard/pull/219
* Show what changed in a what's-new popup after an update or rebuild by @naeemba in https://github.com/naeemba/dashboard/pull/220
* Split renderer.ts under the 600-line limit by @naeemba in https://github.com/naeemba/dashboard/pull/222
* Worker screens ask permission as terminal workers do by @naeemba in https://github.com/naeemba/dashboard/pull/224
* Build and publish releases for Linux, Windows and macOS from GitHub Actions by @naeemba in https://github.com/naeemba/dashboard/pull/221
* Add, change and remove projects.yaml entries from the project command by @naeemba in https://github.com/naeemba/dashboard/pull/223
* Ship /adopt-docs with the app by @naeemba in https://github.com/naeemba/dashboard/pull/225
* Run worker screens' sessions in a screen host so their turn outlives the app by @naeemba in https://github.com/naeemba/dashboard/pull/226

### New Contributors
* @naeemba made their first contribution in https://github.com/naeemba/dashboard/pull/1
* @sanabandi made their first contribution in https://github.com/naeemba/dashboard/pull/190

**Full Changelog**: https://github.com/naeemba/dashboard/commits/v2.42.0
