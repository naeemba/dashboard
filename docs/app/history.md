# App: history

One line per merged change: date and why.

- 2026-09-03 #1 — Terminal dashboard v1: one window, a page per project
- 2026-09-05 #3 — Open projects from a searchable list instead of a config file
- 2026-09-05 #5 — Give the window Ghostty's header
- 2026-09-06 #8 — Ask before closing and reopen where you left off
- 2026-09-07 #14 — Ask the quit question without stopping the main process
- 2026-09-08 #20 — One clamp, in one file, for every list
- 2026-09-14 #34 — Close the project you are on
- 2026-10-05 #69 — Update dependencies to latest; Electron Forge 8
- 2026-10-06 #71 — Sign with a local certificate so folder access survives rebuilds
- 2026-10-25 #81 — An application log, five files of 5 MB
- 2026-10-31 #98 — Screenshots in the README
- 2026-11-01 #135 — slug.ts: one slug rule that main and renderer both import
- 2026-11-01 #146 — Picker, /model and /rewind rank with the one shared ranked
- 2026-11-01 #151 — projects:recent is recent-projects:read (app-rule-1)
- 2026-11-01 #152 — The log screen's help blurb reads its caps from the log's constants
- 2026-11-01 #153 — /resume, the @ file list and the board search rank with ranked too
- 2026-11-02 #181 — A Content-Security-Policy on the window
- 2026-11-06 #220 — A what's-new popup lists the pull requests an update brought
- 2026-11-07 #232 — One themed scrollbar, 7px thumb, for everything but a terminal, a worker's
  Claude screen included
- 2026-11-09 #248 — Log entries carry an error's stack, cause, source, build and context; old ones
  still read (app-decision-2)
- 2026-11-09 #275 — A test holds every IPC channel name to <noun>:<verb> (app-rule-1)
- 2026-11-15 #287 — `pnpm start` on Windows opens the app instead of an empty window: the dev server
  on 127.0.0.1, its reload let through, the PDF viewer's rule kept off the window's main frame
- 2026-11-16 #298 — Every sheet holds the focus in `openOverlay`; the per-dialog holds in the
  viewers, updates, what's new and anchored popups are gone (keys-rule-1)
- 2026-11-24 — The `.dashboard` name is `DASHBOARD_FOLDER_NAME` beside `dashboardPath`, which
  every store joins its file onto; every missing-or-throw read goes through `missing-file.ts`;
  tests use `Promise.withResolvers`
- 2026-11-25 — An app launched without `SSH_AUTH_SOCK`, or with a stale one, takes the agent's
  socket from the systemd user environment, else the login shell, so agents' pushes over SSH work;
  the `.env` read moved with it into `launch-environment.ts`
- 2026-11-26 — `package-pins.test.ts` fails when a held dependency loses its exact version: a bump
  had turned electron, the SDK and marked back into caret ranges with CI green
- 2026-11-27 — `main.ts` split from 600 code lines, its ceiling, to 494: the pane readings went to
  `slot-panes.ts` and the session command's ports to `session-request-ports.ts`, so the next port
  wired into main has room; no behaviour changed
