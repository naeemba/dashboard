# Performance

How to measure where the app spends CPU, memory and time, on a demo instance
that never touches the installed app, so a profiling run can be repeated after
a fix and the numbers compared. What each run found is in
[history.md](history.md), newest first.

## Files

Folder: `scripts/performance/`.

- `stage-demo.sh`: makes the demo folder. It holds its own HOME with six git
  projects (alpha to zeta), each carrying this repository's `board.json` so the
  board is real-sized. It adds a `projects.yaml` naming zeta, a `session-5.json`
  that restores alpha to epsilon, two long conversations for alpha's and beta's
  Claude screens, and `answer.md`, the reply the chat measurement streams.
- `launch-demo.sh`: starts this checkout's build against that folder. It sets
  `HOME`, `--user-data-dir` and the Wayland socket `wl-perf`, and drops every
  `CLAUDE_*`, `DASHBOARD_*` and `ANTHROPIC_*` variable. DevTools listen on 9433 (renderer) and
  9434 (main).
- `demo-instance.mjs`: what the measurements are built from. It covers the
  DevTools protocol client, key presses, CPU and private memory per process from
  `/proc` (the pane host's too, found by its socket folder), keystroke-echo latency, and input-to-paint from the Event Timing API.
  `withInstance` refuses to start while anything answers on 9433 or 9434, which
  would be an earlier run's instance, or another process's inspector, with
  every number read off it. Afterwards it
  kills the whole demo, Ctrl+C included. That covers the process group, anything
  carrying the demo's `--user-data-dir`, and every pane process with the demo's
  HOME, since panes run in sessions of their own.
- `measure.mjs`: one command per measurement, each printing a JSON line per step.
- `calculations.mjs`: the parts that decide something (which process is the
  demo's, what a chord sends, quantiles, the source-map split), pinned by
  `calculations.test.mjs` in `npm test`.
- `build-log-stream.sh`: a pane's fake build log at a given number of lines a
  second.

## Never the installed app

The installed app is not quit, restarted or probed (workflow-rule-1). The demo
gets its own HOME, user data, compositor and ports.

Ports 9222 and 9333 are left alone because the installed app can already be
listening on either. Connecting there reads the real app.

Every `CLAUDE_*` and `DASHBOARD_*` variable is unset so that a demo pane cannot
reach the session that started it. Every `ANTHROPIC_*` variable is unset too
(`ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`). With no
credentials in the environment or the demo's HOME, its Agent SDK sessions
start and resume but never call a model.

## Reproduce

Build once into `.vite/`. The `out/` package is not needed, and its fuses turn
off `--inspect`. `npm run package` rather than `electron-forge package`, so
`prepackage` refuses while a demo instance still runs out of `.vite/`:

    npm ci && npm run package

Start a headless compositor of its own. Nothing appears on your screen:

    weston --backend=headless --renderer=gl --width=1920 --height=1080 --socket=wl-perf --idle-time=0 &

Stage the demo. The two transcripts are any long Claude Code conversations;
the first run used this repository's longest, 8,084 lines (31 MB) and 1,955
lines (8 MB). Keep `$D` short: the pane host's socket is
`$D/userdata/pane-host/panes-1.sock`, and a unix socket's path past about a
hundred bytes cannot be listened on, so a long folder quietly runs every
measurement without the pane host:

    D=/tmp/dashboard-performance
    scripts/performance/stage-demo.sh $D ~/.claude/projects/<slug>/<long>.jsonl ~/.claude/projects/<slug>/<second>.jsonl

Each measurement launches a fresh instance, does its steps and kills only that
instance:

| Command | What it does |
|---|---|
| `measure.mjs startup $D [runs] [chat-sessions-long.json]` | Launch to app ready, first paint, every restored project, and alpha's long chat drawn |
| `measure.mjs boot $D` | Main-process CPU profile of the first 3 s, into `$D/boot-main.cpuprofile` |
| `measure.mjs lag $D [seconds]` | Every time main's event loop is more than 50 ms late after launch, with typing in a worker throughout |
| `measure.mjs streams $D [lines/s]` | Four workers on alpha streaming: CPU with alpha shown, then hidden behind gamma, typing beside them, a main profile, memory |
| `measure.mjs flood $D [shown\|hidden] [host\|no-host]` | One worker runs `seq 1 inf` flat out. CPU of Electron's processes and the pane host, main and renderer profiles, then Ctrl+C, how long the pane keeps printing, and whether it stopped. `no-host` puts a file where the pane host's socket folder goes, so the app runs the pty itself |
| `measure.mjs chat $D [characters] [per delta] [ms]` | A long answer streamed into alpha's Claude screen as SDK `text_delta` events sent from main; no model call |
| `measure.mjs keys $D` | Input to next paint for board arrows and tab switches, then idle CPU with a terminal focused (cursor blink) |
| `measure.mjs ipc $D [seconds]` | Messages and bytes per IPC channel with four streams running: `send` and `invoke` to main, `invoke` replies, and everything main sends |
| `measure.mjs cycles $D [count]` | Opens and closes zeta from a pane. Renderer heap, DOM nodes, listeners, main handles and CLI count after each batch |
| `measure.mjs soak $D [minutes]` | Five streaming workers and a tab-and-board round every minute, with memory after a GC each minute |
| `measure.mjs memory $D` | Private memory of every Electron process and every child of main |
| `measure.mjs usage-sweep ~/.claude/projects` | No instance. The app's own `sweepUsage`, loaded through vite, on a real log folder, read-only: the first sweep, a later one, and the longest the thread was held. Then the first sweep again on the built `usage-worker.js` thread, as the app runs it, with how long main was held and its token total beside the in-process one |
| `measure.mjs bundle $D` | Minified renderer bytes per package, from a source-mapped build into `$D` |
| `measure.mjs profile <file.cpuprofile> [n]` | Self time per function of a profile written by the others |

All commands are run as `node scripts/performance/measure.mjs …` from the
repository root.

To see the usage sweep inside the app, copy some large `.jsonl` files into
`$D/home/.claude/projects/<any folder>/` before `lag`.

## How to read the numbers

- **Memory** is private memory (`Private_Clean + Private_Dirty` from
  `/proc/<pid>/smaps_rollup`), not RSS. Summed RSS counts every shared page once
  per process.
- **CPU %** is utime plus stime from `/proc/<pid>/stat` over the window: 100 is
  one core. The renderer's `taskPercent`, `layoutPercent` and so on come from
  DevTools `Performance.getMetrics`.
- **Typing latency** is keydown to the first frame after the focused pane's rows
  change. It includes the whole echo trip through main, the pty and the shell.
- **Input to paint** comes from Event Timing entries for `keydown`: the handler
  and the render up to the frame that shows it. The browser reports only
  presses over 16 ms.

## Scenarios

- Given a fix to a finding in history.md, when its measurement is rerun on the same machine, then the new number goes in a new dated section beside the old one.
- Given the installed app is running, when any measurement runs, then the installed app's windows, ports and user data are untouched.

## Open questions

- Every number so far is from one Linux machine (i7-11800H, 16 threads) under
  headless weston. None has been taken on macOS or on a slower machine.
- The packaged build (asar, fuses) was not timed. Its fuses refuse `--inspect`,
  so main can only be profiled from `.vite/`.
