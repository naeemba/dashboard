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
