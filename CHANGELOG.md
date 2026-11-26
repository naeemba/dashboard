# Changelog

## v2.59.0 (2026-11-26)

### What's new

- Board card writes never leave the main checkout dirty
- Review workers run their set-up and wrap-up inside pr-loop
- pane run --worktree survives one failed git fetch
- pr wait refuses a draft PR; pr create, ready and comment retry GitHub 5xx safely
- dashboard status: one call for panes, cards, PRs and CI
- Heavy checks wait on a machine-wide lock instead of flaking under load
- browser eval's script-file read gets a tested decision
- pr land hands its conflicts to the branch's worker and lands again
- Card ship's fetch gets the same timeout as the throwaway's
- Name the nine bare Windows skips
- Running-app guard: match the mac install path case-insensitively
- Split board-view.ts along its drag-and-drop seam
- Check exact dependency pins with a test
- Name the five suite-level Windows skips after their reason
- The manager page gets a browser of its own
- Workers popup follow-ups: anchor it to the count, keyboard pane links, live refresh
- Worktree sweeps treat board-only leftovers as nothing to keep
- One conversation port per slot in chat-sessions.ts
- Research: an app-held pane pool with a queue and a 4-running cap
- Make the POSIX path-literal tests portable instead of skipping them on Windows
- Deleting a board-only worktree from the list asks first when its board edits never reached GitHub
- Cache the usage sweep's per-file counts so a launch rereads only changed session logs
- Keep less terminal scrollback once a heap snapshot shows it dominates
- Experiment: keep the hidden manager page painted so Ctrl+1 skips the GPU repaint
- Window transparency setting (for example 0.7 opacity)
- The review's worktree removal (swap/clear) asks first when board edits never reached GitHub
- finished-work tests time out on the Windows CI job
- App-held pane pool: a 4-running cap and a queue, through one action
- Browser tabs are closed by asking the agent that owns them, never silently

### What's Changed
* Fast-forward the checkout past untracked files after a board sync by @naeemba in https://github.com/naeemba/dashboard/pull/379
* Review workers run the loop's set-up and wrap-up in two fixed calls by @naeemba in https://github.com/naeemba/dashboard/pull/382
* pane run --worktree survives one failed git fetch by @naeemba in https://github.com/naeemba/dashboard/pull/378
* pr wait refuses a draft; pr create, ready and comment retry GitHub 5xx safely by @naeemba in https://github.com/naeemba/dashboard/pull/380
* pane status: panes, cards, PRs and CI in one call by @naeemba in https://github.com/naeemba/dashboard/pull/383
* Heavy checks wait on a machine-wide lock instead of flaking under load by @naeemba in https://github.com/naeemba/dashboard/pull/384
* browser eval's script-file read gets a tested decision by @naeemba in https://github.com/naeemba/dashboard/pull/386
* pr land hands its conflicts to the branch's worker and lands again by @naeemba in https://github.com/naeemba/dashboard/pull/385
* Card ship's fetch gets the same timeout as the throwaway's by @naeemba in https://github.com/naeemba/dashboard/pull/387
* Name the bare Windows skips after their reason by @naeemba in https://github.com/naeemba/dashboard/pull/388
* Running-app guard: match the mac install path in any case by @naeemba in https://github.com/naeemba/dashboard/pull/390
* Move the board's drag and drop out of board-view.ts by @naeemba in https://github.com/naeemba/dashboard/pull/392
* Fail a test when a held dependency loses its exact pin by @naeemba in https://github.com/naeemba/dashboard/pull/394
* Name the five suite-level Windows skips after their reason by @naeemba in https://github.com/naeemba/dashboard/pull/395
* The manager page gets a browser of its own by @naeemba in https://github.com/naeemba/dashboard/pull/391
* Open the workers popup above the count, and refresh it when a worker's agent exits by @naeemba in https://github.com/naeemba/dashboard/pull/396
* Worktree sweeps treat board-only leftovers as nothing to keep by @naeemba in https://github.com/naeemba/dashboard/pull/393
* Read a slot's conversation in one place by @naeemba in https://github.com/naeemba/dashboard/pull/399
* Make the POSIX path-literal tests portable instead of skipping them on Windows by @naeemba in https://github.com/naeemba/dashboard/pull/398
* Ask before d removes a worktree whose board edits never reached origin by @naeemba in https://github.com/naeemba/dashboard/pull/400
* Build the finished-work tests' git repository once and copy it per test by @naeemba in https://github.com/naeemba/dashboard/pull/404
* Save the usage sweep's per-file counts so a launch rereads only changed logs by @naeemba in https://github.com/naeemba/dashboard/pull/401
* Give a worker 5000 lines of scrollback, half of the editor's by @naeemba in https://github.com/naeemba/dashboard/pull/403
* Record that keeping the hidden manager painted does not speed up Ctrl+1 by @naeemba in https://github.com/naeemba/dashboard/pull/402
* Window opacity setting: a see-through window behind solid text by @naeemba in https://github.com/naeemba/dashboard/pull/407
* Keep a reviewed worktree whose board edits never reached origin by @naeemba in https://github.com/naeemba/dashboard/pull/405
* Hold main's workers to a cap of 4 and queue starts past it by @naeemba in https://github.com/naeemba/dashboard/pull/408
* Browser tabs are closed by asking the agent that holds them, never on a timer by @naeemba in https://github.com/naeemba/dashboard/pull/406


**Full Changelog**: https://github.com/naeemba/dashboard/compare/v2.58.0...v2.59.0

## v2.58.0 (2026-11-25)

### What's new

- browser: open data: URLs, so a worker can check a fixture page
- checks: posixPathsOnly shared from src/main/testing/; check.log opens with the summary
- work-card: report to main once the PR opens; a coverage-line file gets a test or a reason
- Workers close when main's own command finishes their work, never on a timer
- Agent browser tabs: never take the keyboard, and render as a foreground tab while off screen

### What's Changed
* browser: open data: URLs, so a worker can check a fixture page by @naeemba in https://github.com/naeemba/dashboard/pull/372
* checks: posixPathsOnly shared from src/main/testing/; check.log opens with the summary by @naeemba in https://github.com/naeemba/dashboard/pull/373
* work-card: report to main once the PR opens; a coverage-line file gets a test or a reason by @naeemba in https://github.com/naeemba/dashboard/pull/374
* Workers close when main's own command finishes their work, never on a timer by @naeemba in https://github.com/naeemba/dashboard/pull/376
* Agent browser tabs never take the keyboard, and run as a foreground tab while held by @naeemba in https://github.com/naeemba/dashboard/pull/377


**Full Changelog**: https://github.com/naeemba/dashboard/compare/v2.57.0...v2.58.0

## v2.57.0 (2026-11-25)

### What's new

- browser upload: set a file input's files, so a form with a CV upload is filled in a Dashboard tab

### What's Changed
* browser upload: set a file input's files, so a form with a CV upload is filled in a Dashboard tab by @naeemba in https://github.com/naeemba/dashboard/pull/370


**Full Changelog**: https://github.com/naeemba/dashboard/compare/v2.56.0...v2.57.0

## v2.56.0 (2026-11-24)

### What's new

- Agents pick the Dashboard browser on their own: a skill and a when-to-use block
- Tidy-ups: the .dashboard folder name, one read-or-null helper, Promise.withResolvers in tests
- A browser release leaves an agent's page size on the person's tab
- Running-app guard: cover the Windows Squirrel install and Windows process killers
- shellBody reads powershell -Command, pwsh -c and cmd /c bodies for every guard
- Ship and review on a GitLab project: /work-card ends in gh pr create
- Review worker asks before landing a loop's design change when merging is on
- Sessions get the SSH agent even when the app was launched without SSH_AUTH_SOCK

### What's Changed
* Agents pick the Dashboard browser on their own: a skill and a when-to-use block by @naeemba in https://github.com/naeemba/dashboard/pull/360
* Tidy-ups: the .dashboard folder name, one read-or-null helper, Promise.withResolvers in tests by @naeemba in https://github.com/naeemba/dashboard/pull/363
* A browser release clears the page size an agent set by @naeemba in https://github.com/naeemba/dashboard/pull/362
* Running-app guard: cover the Windows Squirrel install and Windows process killers by @naeemba in https://github.com/naeemba/dashboard/pull/364
* shellBody reads powershell -Command, pwsh -c and cmd /c bodies for every guard by @naeemba in https://github.com/naeemba/dashboard/pull/367
* Ship and review a GitLab project's card through glab and /mr-loop by @naeemba in https://github.com/naeemba/dashboard/pull/366
* Review pane asks before landing a loop's design change when merging is on by @naeemba in https://github.com/naeemba/dashboard/pull/368
* Sessions get the SSH agent even when the app was launched without SSH_AUTH_SOCK by @naeemba in https://github.com/naeemba/dashboard/pull/369


**Full Changelog**: https://github.com/naeemba/dashboard/compare/v2.55.0...v2.56.0

## v2.55.0 (2026-11-24)

### What's new

- The package-manager guard follows cd
- Workers check for overlapping cards and PRs, and start from codegraph
- pnpm check shows why a check failed, and changed branches get a coverage line
- pane run --worktree and ship work on a project whose remote is not origin
- Budget: an optional daily pace toward the weekly reset
- Agents reach for the Dashboard browser, and it can run a page script
- One cd-following helper for the three Bash guards, ending a cd at a subshell's close
- pr wait, a land that survives network blips, and commands across a version gap
- A docs check refuses a duplicate docs id or a leftover -next id

### What's Changed
* Follow a cd in the package-manager guard by @naeemba in https://github.com/naeemba/dashboard/pull/349
* /work-card: start from codegraph, check for overlapping cards and PRs, take docs ids last by @naeemba in https://github.com/naeemba/dashboard/pull/352
* pnpm check shows why a check failed, and a coverage line for the change by @naeemba in https://github.com/naeemba/dashboard/pull/351
* Ship and pane run --worktree on a project whose remote is not origin by @naeemba in https://github.com/naeemba/dashboard/pull/353
* Budget: a weekly cap, a daily pace since the weekly reset, or none by @naeemba in https://github.com/naeemba/dashboard/pull/355
* Agents reach for the Dashboard browser, and it can run a page script by @naeemba in https://github.com/naeemba/dashboard/pull/356
* One cd walk for the three Bash guards, and Git Bash drive paths on Windows by @naeemba in https://github.com/naeemba/dashboard/pull/359
* pr wait, a land that survives network blips, and commands across a version gap by @naeemba in https://github.com/naeemba/dashboard/pull/357
* Lint refuses a duplicate docs heading id and a leftover -next id by @naeemba in https://github.com/naeemba/dashboard/pull/358


**Full Changelog**: https://github.com/naeemba/dashboard/compare/v2.54.0...v2.55.0

## v2.54.0 (2026-11-23)

### What's new

- Browser: an agent's background tab lays out, screenshots and reads like a visible one
- Dashboard as an MCP server: every command verb as a tool
- Throwaway worktrees stop piling up

### What's Changed
* Browser: an agent's background tab screenshots, resets and reads like a visible one by @naeemba in https://github.com/naeemba/dashboard/pull/345
* Dashboard as an MCP server: every command verb as a tool by @naeemba in https://github.com/naeemba/dashboard/pull/346
* Throwaway worktrees go with their pane unless they hold work by @naeemba in https://github.com/naeemba/dashboard/pull/348
* Remove merged worktrees: a reviewed card's in the same run, squash-merged throwaways, and unrecorded leftovers by @naeemba in https://github.com/naeemba/dashboard/pull/347


**Full Changelog**: https://github.com/naeemba/dashboard/compare/v2.53.0...v2.54.0

## v2.53.0 (2026-11-21)

### What's new

- Research: a built-in browser per project that agents can drive
- One test run at a time per worktree
- Main sessions from an earlier launch are stopped, and a launch never starts a second main
- Browser mode: a per-project browser with tabs, beside board and nvim
- Browser: sign-in popups finish (Sign in with GitHub, SSO)
- dashboard browser command: agents claim tabs, read, screenshot, act, release

### What's Changed
* One test run at a time per worktree by @naeemba in https://github.com/naeemba/dashboard/pull/340
* Main sessions from an earlier launch are stopped, and a launch never starts a second main by @naeemba in https://github.com/naeemba/dashboard/pull/342
* Browser mode: a per-project browser with tabs by @naeemba in https://github.com/naeemba/dashboard/pull/341
* Browser: sign-in popups finish (Sign in with GitHub, SSO) by @naeemba in https://github.com/naeemba/dashboard/pull/343
* dashboard browser: agents claim tabs, read, screenshot, act, release by @naeemba in https://github.com/naeemba/dashboard/pull/344


**Full Changelog**: https://github.com/naeemba/dashboard/compare/v2.52.0...v2.53.0

## v2.52.0 (2026-11-19)

### What's new

- Worker skills: subtasks in board show, PR recorded at once, codegraph, grep docs, history line before the PR
- App: card worktrees get their packages installed, a clearer early-review refusal, main told about dashboard --version
- pnpm check prints a three-line summary, and lint holds markdown line width
- board review looks for the card's pull request before refusing
- Main brings a review loop's design change to the user before landing

### What's Changed
* Worker skills: subtasks in board show, codegraph, docs by grep, history line before the PR by @naeemba in https://github.com/naeemba/dashboard/pull/335
* Card worktrees get their packages installed, a clearer early-review refusal, main told about dashboard --version by @naeemba in https://github.com/naeemba/dashboard/pull/334
* pnpm check prints a line a check, and lint holds markdown to 100 columns by @naeemba in https://github.com/naeemba/dashboard/pull/336
* board review looks for the card's pull request before refusing by @naeemba in https://github.com/naeemba/dashboard/pull/337
* Main's prompt: ask before landing a review loop's design change; add a project before working in it by @naeemba in https://github.com/naeemba/dashboard/pull/338


**Full Changelog**: https://github.com/naeemba/dashboard/compare/v2.51.0...v2.52.0

## v2.51.0 (2026-11-18)

### What's new

- board command: list hides Done and Cancelled, short card ids, and usage says no git pull
- Guardrails: CI refuses card files in PR diffs, pre-commit stops without node_modules, release.sh waits for CI
- dashboard command: pr land fast-forwards the checkout, --version, pane list --reports, usage fixes
- rebuild.sh installs dependencies before packaging
- release.sh checks for a running app before it updates the checkout

### What's Changed
* rebuild.sh: install on Windows (Git Bash) by @sanabandi in https://github.com/naeemba/dashboard/pull/325
* board: list hides Done and Cancelled, short card ids, and usage says no git pull by @naeemba in https://github.com/naeemba/dashboard/pull/327
* Guardrails: CI refuses card files in PR diffs, pre-commit stops without node_modules, release.sh waits for CI by @naeemba in https://github.com/naeemba/dashboard/pull/328
* dashboard command: pr land fast-forwards the checkout, --version, pane list --reports, usage fixes by @naeemba in https://github.com/naeemba/dashboard/pull/329
* rebuild.sh installs dependencies before packaging by @naeemba in https://github.com/naeemba/dashboard/pull/331
* release.sh checks for a running app before it updates the checkout by @naeemba in https://github.com/naeemba/dashboard/pull/333


**Full Changelog**: https://github.com/naeemba/dashboard/compare/v2.50.0...v2.51.0

## v2.50.0 (2026-11-17)

### What's new

- pane send refuses text that starts claude
- Board guard refuses npm/yarn in a pnpm project
- Board guard refuses removing its own worktree and editing another worktree
- board ship commits the card, column Ship, onto the work branch
- Refresh every project's stale .dashboard/CLAUDE.md (still says edit board.json)
- A board write that cannot reach origin writes a worktree's card file in place, and it can ride a merge
- Review loop merges through pr land
- Warn when /pr-loop is missing or out of date, and refuse a review without it

### What's Changed
* pane send refuses text that starts claude by @naeemba in https://github.com/naeemba/dashboard/pull/318
* board guard refuses another package manager than the lockfile names by @naeemba in https://github.com/naeemba/dashboard/pull/319
* Board guard refuses removing its own worktree and editing another worktree by @naeemba in https://github.com/naeemba/dashboard/pull/320
* A ship commits no board move onto the card's branch by @naeemba in https://github.com/naeemba/dashboard/pull/321
* Rewrite the seeded .dashboard docs whenever they are not the current text by @naeemba in https://github.com/naeemba/dashboard/pull/317
* Board: a write that cannot reach origin is refused in a worktree, and a dropped connection is retried by @naeemba in https://github.com/naeemba/dashboard/pull/322
* Review with merging on lands through pr land by @naeemba in https://github.com/naeemba/dashboard/pull/323
* Refuse a review without /pr-loop, and warn when it is out of date by @naeemba in https://github.com/naeemba/dashboard/pull/324


**Full Changelog**: https://github.com/naeemba/dashboard/compare/v2.49.0...v2.50.0

## v2.49.0 (2026-11-17)

### What's new

- pane run --in <folder>: a Claude screen in an existing worktree

### What's Changed
* pane run --in <folder>: a worker in an existing worktree by @naeemba in https://github.com/naeemba/dashboard/pull/316


**Full Changelog**: https://github.com/naeemba/dashboard/compare/v2.48.0...v2.49.0

## v2.48.0 (2026-11-16)

### What's new

- budget verb: 7-day usage against a cap set once
- The close key on a pane hides a scope pane.close could not stop
- After a restart, a cross-project worker's done notice goes to the wrong main
- Hold focus inside confirmOverlay and promptOverlay so Shift+Tab cannot leave them
- Bring the manager's worker panes back after a restart
- Agent state per pane from Claude Code hooks, answered from the manager list
- Two open projects with the same folder name share one main session name
- Finish what the pane host left: stale session socket, editor, orphans
- pr land checks the PR state after a merge call that fails
- Salvaging a second broken board.json overwrites the first board.json.broken
- The sweep closes a --worktree worker whose PR merged
- projects:open refuses by throwing, so the remote screen reads Electron's invoke prefix
- board command crashes with EPIPE when its output is cut off (| head)
- Add the missing #258 to its workers history line
- renderer.ts project-close comment points at CLAUDE.md instead of keys-decision-2
- Worker screens: check the last turn is drawn after a pane send
- Turn off the terminal cursor blink that costs idle CPU
- A turn the session starts by itself shows on no Claude screen
- Skip xterm's selection redraw on scroll when nothing is selected
- A card in Review gets its review even when the sweep closed its worker's pane

### What's Changed
* budget verb: 7-day usage against a cap set once by @naeemba in https://github.com/naeemba/dashboard/pull/296
* pane.close warns in the log when a pane's scope will not stop by @naeemba in https://github.com/naeemba/dashboard/pull/297
* Tell a restored worker's report to the main that dispatched it by @naeemba in https://github.com/naeemba/dashboard/pull/299
* Hold the focus in every dialog openOverlay builds by @naeemba in https://github.com/naeemba/dashboard/pull/298
* Bring the manager's worker panes back after a restart by @naeemba in https://github.com/naeemba/dashboard/pull/301
* Answer a Claude screen's question from the manager row by @naeemba in https://github.com/naeemba/dashboard/pull/302
* Give each open project a session name of its own by @naeemba in https://github.com/naeemba/dashboard/pull/300
* Keep the editor in the pane host, and end kept shells nobody takes back by @naeemba in https://github.com/naeemba/dashboard/pull/303
* pr land reads a failed merge back from the pull request by @naeemba in https://github.com/naeemba/dashboard/pull/304
* A second broken board.json or worktrees.json no longer overwrites the first set-aside copy by @naeemba in https://github.com/naeemba/dashboard/pull/305
* The sweep closes a --worktree worker whose PR merged by @naeemba in https://github.com/naeemba/dashboard/pull/306
* Test that projects:open answers its refusals instead of throwing by @naeemba in https://github.com/naeemba/dashboard/pull/307
* End the commands quietly when their output is cut off (| head) by @naeemba in https://github.com/naeemba/dashboard/pull/308
* Add #258 to its workers history line; point the project-close comment at keys-decision-2 by @naeemba in https://github.com/naeemba/dashboard/pull/310
* Keep a pinned Claude screen at its end when it is shown again by @naeemba in https://github.com/naeemba/dashboard/pull/309
* Turn off the terminal cursor blink that costs idle CPU by @naeemba in https://github.com/naeemba/dashboard/pull/312
* A turn the session starts by itself shows as working on the Claude screen by @naeemba in https://github.com/naeemba/dashboard/pull/311
* Skip a shown terminal's selection redraw when nothing is selected by @naeemba in https://github.com/naeemba/dashboard/pull/313
* A card in Review gets its review after a refused start by @naeemba in https://github.com/naeemba/dashboard/pull/315


**Full Changelog**: https://github.com/naeemba/dashboard/compare/v2.47.0...v2.48.0

## v2.47.0 (2026-11-16)

### What's new

- Audit 10: hook that refuses a zsh path= assignment (dotfiles)
- App-owned /work-card skill; version bump is a per-project setting
- pane run refuses a just-claimed pane as busy (systemd-run seen as a command)
- App holds pane-command permissions; review prompt stops moving cards to Done
- Review worker merges only with review.autoMerge on (off by default; global + per-project)
- board move/comment/add commit and push by themselves, so the board never conflicts
- Wait on CI without polling, and stop pr-loop's blocked run-cancel step
- Add a pre-commit hook and a typecheck script
- Worker notices: one per turn, only when the worker has no background work left
- Move the manager's /tmp scripts into the CLI: dispatch, finish, land, budget

### What's Changed
* Windows: pnpm start opens the app, plus a step-by-step setup guide by @sanabandi in https://github.com/naeemba/dashboard/pull/287
* App-owned /work-card skill; version bump is a per-project setting by @naeemba in https://github.com/naeemba/dashboard/pull/288
* pane run refuses a just claimed pane as bus by @naeemba in https://github.com/naeemba/dashboard/pull/289
* App holds pane-command permissions; review prompt stops moving cards to Done by @naeemba in https://github.com/naeemba/dashboard/pull/290
* Review worker merges only with review.autoMerge on by @naeemba in https://github.com/naeemba/dashboard/pull/291
* Wait on CI with one background watch in the review prompt by @naeemba in https://github.com/naeemba/dashboard/pull/292
* Add a pre-commit hook and a typecheck script by @naeemba in https://github.com/naeemba/dashboard/pull/293
* Worker notices carry the last message, skip turns you typed, and pane report by @naeemba in https://github.com/naeemba/dashboard/pull/294
* Move the manager's /tmp scripts into the CLI: pane finish, pr land by @naeemba in https://github.com/naeemba/dashboard/pull/295


**Full Changelog**: https://github.com/naeemba/dashboard/compare/v2.46.0...v2.47.0

## v2.46.0 (2026-11-09)

### What's new

- The manager's log page: copy button per entry, and a click opens the entry formatted in a popup
- Opening a shell or monitor task on the Claude screen shows its output
- Notices and errors on the status bar go away by themselves, are logged, and notify
- Run each pane and agent session in its own systemd scope: slices, the scope decision, panes
- Stop a pane's systemd scope when the pane closes or is released
- The board command keeps the board in step with git itself
- Scope the Claude sessions the SDK starts and the manager's tasks
- Stop every scope a pane leaves: on project close and when a dispatch replaces a pane's shell
- Stop the old scope when a shell restarts (pty:restart) or a kept shell is not adopted on restore
- Every worker reports to the main that gave it work, and the app closes finished worker panes
- A card's column follows its pull request; the app writes the ship comment
- Enforce the board with a hook and the app's session instructions, then delete the CLAUDE.md board rules
- Pull request status on the Ship card, found from the branch through gh
- unicode-bidi: plaintext skips worker Claude screens
- Audit every CLAUDE.md rule: move what a tool or hook can carry, delete it from CLAUDE.md
- Remove any attached image from the Claude screen's prompt
- Show each pane's and session's memory from its systemd scope
- pane release prints 'session release failed: spawn git ENOENT'
- Audit 2: test that every input and textarea gets dir = 'auto'
- Claude screens get Claude in Chrome when the user has it on
- Audit 1: lint String(error) outside the failure files, and fix board-view.ts
- Audit 4: test that adopt-docs-skill.ts carries the CLAUDE.md docs pattern
- A main that read a worker's report but kept it running still gets a false stop notice
- Audit 5: CI fails a pull request that moves package.json version
- Audit 3: test that every IPC channel is <noun>:<verb>
- Audit 7: test that every renderer key handler checks isModified first
- Audit 6: eslint max-lines at 600 code lines
- Audit 8: test that every display class has its [hidden] rule
- Audit 12: shrink the seeded .dashboard/CLAUDE.md to the board command
- Audit 9: hook that refuses quitting, killing or restarting the running app
- Two sessions run in one worker pane
- Resuming a conversation opens the kind it was: a screen stays a screen
- Audit 13: delete the CLAUDE.md rules the audit moved or found already enforced
- Audit 11: load the final-message rule once, from its hook (dotfiles)

### What's Changed
* The log page: a click opens an entry formatted, a key copies it by @naeemba in https://github.com/naeemba/dashboard/pull/250
* Opening a shell or monitor task on the Claude screen shows its output by @naeemba in https://github.com/naeemba/dashboard/pull/251
* Status-bar messages fade, are logged, and an error notifies while away by @naeemba in https://github.com/naeemba/dashboard/pull/252
* Run each pane's shell in a systemd scope of its own by @naeemba in https://github.com/naeemba/dashboard/pull/253
* Stop a pane's systemd scope when the pane closes or is released by @naeemba in https://github.com/naeemba/dashboard/pull/255
* The board command keeps the board in step with git itself by @naeemba in https://github.com/naeemba/dashboard/pull/254
* Run Claude screens' sessions and the manager's tasks in their own systemd scopes by @naeemba in https://github.com/naeemba/dashboard/pull/256
* Stop every scope a pane leaves: on project close and when a dispatch replaces a pane's shell by @naeemba in https://github.com/naeemba/dashboard/pull/257
* Stop the old scope when a shell restarts or a kept shell is not taken back by @naeemba in https://github.com/naeemba/dashboard/pull/260
* Report handed-over work to its main, and close finished worker panes by @naeemba in https://github.com/naeemba/dashboard/pull/258
* A card's column follows its pull request, and the app writes the ship comment by @naeemba in https://github.com/naeemba/dashboard/pull/261
* Enforce the board with a hook and session instructions, retire board-rule-2 by @naeemba in https://github.com/naeemba/dashboard/pull/262
* Bidi plaintext reaches a worker's Claude screen by @naeemba in https://github.com/naeemba/dashboard/pull/263
* A card shows its pull request's checks and review as one glyph by @naeemba in https://github.com/naeemba/dashboard/pull/266
* Audit every CLAUDE.md rule: keep, move to a tool, or delete by @naeemba in https://github.com/naeemba/dashboard/pull/270
* Remove any attached image from the Claude screen's prompt by @naeemba in https://github.com/naeemba/dashboard/pull/264
* Release a worker whose throwaway worktree a merge already removed by @naeemba in https://github.com/naeemba/dashboard/pull/267
* Test that every input and textarea gets dir = 'auto' by @naeemba in https://github.com/naeemba/dashboard/pull/273
* Claude screens get Claude in Chrome when the user has it on by @naeemba in https://github.com/naeemba/dashboard/pull/271
* Lint String(error) outside the failure files, and fix board-view.ts by @naeemba in https://github.com/naeemba/dashboard/pull/274
* Hold a worker's stop notice while its main is mid-turn by @naeemba in https://github.com/naeemba/dashboard/pull/265
* Test that every IPC channel is <noun>:<verb> (app-rule-1) by @naeemba in https://github.com/naeemba/dashboard/pull/275
* Test that /adopt-docs carries the CLAUDE.md docs pattern by @naeemba in https://github.com/naeemba/dashboard/pull/276
* Audit 5: CI fails a pull request that moves package.json version by @naeemba in https://github.com/naeemba/dashboard/pull/277
* eslint: refuse a file over 600 code lines (Audit 6) by @naeemba in https://github.com/naeemba/dashboard/pull/278
* Show each pane's and session's memory from its systemd scope by @naeemba in https://github.com/naeemba/dashboard/pull/268
* Audit 7: test that every renderer key handler checks isModified first by @naeemba in https://github.com/naeemba/dashboard/pull/280
* Audit 8: test that every display class has its [hidden] rule by @naeemba in https://github.com/naeemba/dashboard/pull/279
* Shrink the seeded .dashboard/CLAUDE.md to the board command by @naeemba in https://github.com/naeemba/dashboard/pull/282
* Refuse quitting, killing or replacing the running app in the board guard hook by @naeemba in https://github.com/naeemba/dashboard/pull/281
* One session per worker pane when the screen host dies by @naeemba in https://github.com/naeemba/dashboard/pull/283
* Resuming a conversation opens the kind it was: a screen stays a screen by @naeemba in https://github.com/naeemba/dashboard/pull/284
* Audit 13: delete the CLAUDE.md rules a check now holds by @naeemba in https://github.com/naeemba/dashboard/pull/285


**Full Changelog**: https://github.com/naeemba/dashboard/compare/v2.45.0...v2.46.0

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
