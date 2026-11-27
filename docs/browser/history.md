# Browser: history

One line per merged change: date and why.

- 2026-11-20 — A fifth project mode: a browser per project, with tabs, its own
  sign-ins, and its keys handed to the window from inside the page
- 2026-11-20 — Agents drive the project's browser through `dashboard browser`:
  they open or claim a tab, read, screenshot, snapshot and click in it, and you
  take any tab back with a key
- 2026-11-20 — A sign-in popup finishes: a page's new window becomes its tab with
  its opener kept, and goes when the page closes itself
- 2026-11-23 — An agent's tab behind yours screenshots, and lays out at its
  view's size again after a `reset`, as one on screen does; `read` keeps
  GitHub's conversation, and a stale ref says to take a new snapshot
- 2026-11-24 — Agents are sent to this browser for any page instead of
  Playwright or Claude in Chrome, and `eval` runs a script file in a page, after
  `--wait-for` when given; pictures move to `browser-files/`, and the old
  `browser-screenshots/` folder is removed when the app starts
- 2026-11-24 — The server's instructions get a WHEN TO USE block and the app installs a
  `dashboard-browser` skill, because workers holding the `browser_` tools still browsed in Claude
  in Chrome; Chrome stays for a page that needs the person's own profile (browser-decision-8)
- 2026-11-24 — A tab handed back, by a release, a pane let go or the revoke key, has the size an
  agent's resize gave it cleared, because the person was handed the tab drawn 390 wide; the
  work-card skill, review prompt and main's prompt have their tool names checked against the
  server's
- 2026-11-25 — `browser upload` and `browser_upload` set a file input's files, because job-search's
  apply workers each opened a Playwright window only to upload a CV; the filled form is left for
  the person to submit
- 2026-11-25 — the address bar and `browser open` load a `data:` address, because a worker checking
  how `browser snapshot` lists file inputs was refused one and skipped the live check; `file:` stays
  refused, as a tab never shows a file on this disk
- 2026-11-25 — A load in an agent's tab gives the keyboard back to where you were typing, because
  a worker's `browser open` or `go` took the caret out of main's prompt; and an agent's tab is drawn
  one pixel into the window's corner, because a hidden tab reported `hidden`, painted nothing and
  an agent measuring performance got its first contentful paint only from a screenshot
- 2026-11-26 — `browser eval`'s refusal of a script file it cannot read is `evalRequest` in
  `browser-cli.ts`, with a test, because it sat untested in `browser-program.ts`
- 2026-11-26 — the manager has a browser of its own: the door refused its panes with "name a
  project with --project", so its agents named one and drove that project's tabs and sign-ins
- 2026-11-26 — a main's tab unused for 30 minutes gets one question to that main, which closes it
  with the new `browser close` or keeps it, and main is told the tabs a pane let go of left open,
  because 11 open tabs held about 517 MB and the user wants the agent, never a timer, to close one
- 2026-11-26 — a worker is asked about the tabs it holds when its turn ends with nothing running,
  in a turn kept out of its report and main's notice, because a release kills the agent and the
  user wants the one holding a tab to decide while it still can
- 2026-11-27 — `browser.proxy` sends the hosts it lists through a proxy and every other site
  direct, because work sites answer only through a VPN run as a local proxy
