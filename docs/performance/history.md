# Performance: history

One section per profiling run, newest first. Each finding gives the measured
number, where in the code, what you notice, and a fix sized small, medium or
large. Findings are ranked by what you notice. Commands are in
[README.md](README.md).

## 2026-11-02: first profile (v2.41.1)

Linux, i7-11800H (16 threads), headless weston, `.vite/` build. The load was 5
projects restored, the manager, and alpha's Claude screen on this repository's
longest conversation (8,084 lines, 31 MB) with beta's on an 8 MB one. Alpha had
4–5 worker panes streaming a coloured build log, plus the 153-card board. The
installed app was never touched.

### Findings

1. **The first usage sweep reads every Claude Code log on main's thread.**
   - Measured: on this machine that is 4,585 files and 4.53 GB, taking 56 s
     and 46 CPU-s. The longest single hold is 477 ms, on one 128.8 MB log.
   - In the app, with 0.5 GB of those logs copied in, main's event loop was
     more than 50 ms late 22 times between 3.5 s and 7.1 s after launch, worst
     411 ms. One keystroke echo took 356 ms. A launch without the logs had
     none of those.
   - Where: `src/main/usage/usage-sweep.ts` (`FIRST_SWEEP_MS`, 3 s after
     launch) and `usage-store.ts` `sweepUsage` / `countInto`. The first pass
     reads every file whole and parses every line that holds `"usage"`.
   - You notice: for about the first minute after every launch, panes freeze
     for up to half a second at a time and typing stutters.
   - Fix (medium): save each file's size and counts in userData, so a launch
     reads only bytes appended since the last run. Do the parsing off main's
     thread (a worker thread).
2. **Every board arrow key rebuilds the whole board.**
   - Measured: on 153 cards, input to next paint is 88–128 ms median over two
     runs, worst 152 ms. The key handler alone takes 44–114 ms. Opening the
     board takes 32–160 ms.
   - Where: `src/renderer/board/board-view.ts:884` (`board-select`) calls
     `render()`, which rebuilds every column and card (`replaceChildren`,
     line 688) and then `renderStatus`.
   - You notice: holding ↓ moves about eight cards a second, and the highlight
     trails the key.
   - Fix (small): a selection move changes the selected class on two cards and
     scrolls. Only a change to the board rebuilds it.
3. **Each page's Claude screen keeps its own `claude` CLI running from
   launch.**
   - Measured: 6 processes (5 projects and the manager), 97–112 MB private
     each, 600 MB together. All of Electron's own processes come to 320 MB.
     Each CLI burns 1.0–1.24 CPU-s starting up.
   - The Agent SDK's own code holds main for 420 ms of the first 3 s, and main
     has about 0.8 s of stalls over 50 ms between 0.67 s and 1.2 s after
     launch.
   - Where: `src/main/main.ts:456` (`chats.open` on project open) and `:640`
     (the manager), which reach `src/main/chat/chat-sessions.ts` `start()`.
   - You notice: five projects take about 0.9 GB, two thirds of it idle CLIs
     for Claude screens you may not open that day. Typing in the first second
     after the window appears lags.
   - Fix (medium): start a page's session the first time its Claude screen is
     shown or a worker reports to it, and stop one that has been idle for a
     while. Workers reporting to main is the constraint to design around.
4. **Hidden projects keep laying out and painting their terminals.**
   - Measured: four workers at 200 lines/s each. With their project shown, the
     renderer runs at 23.8–26.9% CPU and 230–275 layouts per 10 s. With it
     hidden behind another project, 12.6–14.5% CPU and 195–200 layouts per
     10 s. Idle is 0%.
   - Where: hidden pages use `visibility: hidden`
     (`src/renderer/app/index.css:72`). xterm pauses rendering only when its
     IntersectionObserver says the element is off screen, and a
     `visibility: hidden` element still intersects. `bridge.onData` writes into
     every pane (`src/renderer/renderer.ts:763`).
   - You notice: a build running in a project you are not looking at costs
     half the CPU of watching it.
   - Fix (medium): take hidden pages out of the viewport so xterm's observer
     pauses them, keeping their size so nothing refits on return. Then check
     that a pane shows its latest output when the page comes back.
5. **A streaming reply re-renders its whole text every frame.**
   - Measured: a 2k, 8k and 16k-character answer streamed at 600 chars/s put
     the renderer at 39%, 69% and 100% CPU. Layout grows from 9.5% to 31.5%,
     about 60 layouts a second. Typing in a pane meanwhile stayed at 23 ms
     median.
   - Where: `src/renderer/chat/chat-view.ts:216-225`. Its own `ponytail:` note
     says markdown runs over the whole streaming block each frame.
   - You notice: a long answer pins a core and spins the fans. On this machine
     it does not slow typing.
   - Fix (medium): render the finished part once and re-render only the tail
     after the last paragraph break outside a code fence.
6. **A focused terminal's blinking cursor costs CPU while nothing happens.**
   - Measured: renderer at 3.7–5% CPU with about 70 style recalculations a
     second, plus about 1% main and 1% GPU. With the chat input focused it is
     0%, and with xterm's animation turned off it is 0.1%.
   - Where: `cursorBlink: true` in `src/renderer/app/page.ts:318`. xterm's DOM
     renderer blinks with a CSS `@keyframes` on `background-color`, which
     restyles every frame.
   - You notice: an idle Dashboard with a terminal focused keeps a few percent
     of a core busy, which drains battery.
   - Fix (small): turn `cursorBlink` off, or make it a setting with off as the
     default.
7. **A pane printing flat out takes a whole main core, and Ctrl+C does not stop
   it for 2.5 s.**
   - Measured: `seq` in one worker puts main at 109–112% CPU and the renderer
     at 110–119%, with the renderer heap at 124–208 MB. 59% of main's busy
     time (2.3 s of 3.9 s) goes to the pane's headless xterm copy parsing every
     byte, with no remote screen joined.
   - After Ctrl+C the pane keeps printing for 2.6 s when shown and 2.5 s when
     hidden: about 9 million more lines. Typing in the pane beside it stayed at
     24–27 ms median.
   - Where: `src/main/main.ts:429` (`copy.push(data)` on every chunk) and
     `src/main/panes/pane-screen-copy.ts`. The renderer's xterm write queue
     has no flow control back to the pty.
   - You notice: a runaway log cannot be stopped at once. While it runs, main
     answers everything else (board writes, chat events) late.
   - Fix (medium): feed the headless copy only while a host port is set or
     this window is away on another host. Pause the pty when xterm's write
     queue passes a high-water mark (xterm's documented flow-control pattern).
8. **Switching to the manager tab is the slowest tab switch.**
   - Measured: 88–184 ms input to paint, against 24–72 ms for a project tab.
     Its handler alone takes 27–37 ms.
   - Where: `src/renderer/manager/manager-view.ts:492` (`list.replaceChildren`
     on every render, each row reading the live xterm buffer). Each render
     also fires `board:peek` and `worktree:scan` when stale.
   - You notice: Ctrl+1 hesitates, where every other tab key is instant.
   - Fix (small): build the rows once and update the ones whose data changed.

### Ruled out, by measurement

- **Growth over 30 minutes of use.** Five workers streamed 50 lines/s each,
  with a tab-and-board round every minute, and every value below was read after
  a GC.
  - Renderer private memory went from 57 to 155 MB in the first two minutes,
    while scrollback filled. From minute 2 to 30 it went from 155 to 165 MB.
  - The renderer heap stayed at 19–20 MB from minute 2 on. DOM nodes held at
    about 9,670 and listeners at 1,425.
  - Main stayed at 67–69 MB private and 15.2–15.8 MB heap. The GPU process went
    from 82 to 90 MB.
  - The CLIs went from 615 to 497 MB as the OS reclaimed their pages.
- **A leak on project close.** Over 11 open/close cycles the renderer heap stayed
  at 9.5 MB and event listeners at 573. DOM nodes went from 5,098 to 5,148.
  `FSWatcher` handles stayed at 5 and CLI processes at 6. Main's heap went from
  13.7 to 14.1 MB.
- **Startup.** Launch to all 5 projects restored took 0.59–0.68 s, with first
  paint at 0.54–0.66 s. The 31 MB conversation was drawn at 0.90–0.95 s.
- **Typing under load.** Keystroke-echo latency was 23–30 ms median, p90 at
  most 39 ms, with four streams shown or hidden, a flood beside it, or a 16k
  reply streaming.
- **IPC.** Idle traffic is about one message every 5 s. Four streams at 200
  lines/s each make 81 `pty:data` messages and 120 kB a second, already
  batched per pty chunk.
- **Main at ordinary output.** With four streams at 200 lines/s, main spends
  58 ms of each 10 s in JavaScript.
- **Renderer timers when idle.** With the chat input focused, renderer CPU is
  0.0% over 10 s windows, the 5 s and 30 s intervals included.
- **The bundle.** It is 772 KB minified (233 KB gzip): xterm 42%,
  highlight.js common 20%, marked 6%. It loads from disk, and startup is
  within 0.6 s, so splitting it buys nothing measurable.

### Not measured

- The chat view's 1 s working timer that reading the code flags as left running when
  a project closes mid-turn. That needs a real turn, which the demo cannot
  make without credentials.
- A remote screen joined, the packaged (asar) build, macOS, and any machine
  slower than this one.
