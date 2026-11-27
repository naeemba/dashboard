# Should Dashboard move to Rust? (2026-11-26)

2026-11-26: a point-in-time study, not a rule.

Read-only research. Nothing in the repo changed. The running app was only read
through `/proc` and `ps`: never quit, signalled or attached to.

## Short answer

No. Do not rewrite it, and do not add Rust for speed yet. On this machine,
**67% of the memory and about a third of the CPU under the Dashboard install
belongs to the `claude` CLI processes it hosts**, and no rewrite touches those.
The part a rewrite would replace, Electron's main process, holds 115 MB of
private memory and averaged 2.2% of one core over 21 hours.

The single largest thing the app itself owns is the window's renderer: 569 MB
private. That is mostly xterm.js scrollback, and the same xterm.js would still
be running inside a Tauri webview. Tauri would also break the project browser
on Linux and macOS, because every `browser_*` tool is built on the Chrome
DevTools Protocol (CDP). The work that would actually help is TypeScript work,
listed in section 4.

## 1. Where the time and memory go today

### Measured on the running app

Linux 7.3.4 (Manjaro), Wayland. The app (PID 3110496) had been up 75,700 s,
about 21 hours. Memory is PSS from `/proc/<pid>/smaps_rollup`, which splits
shared pages fairly between processes; private memory is given where it
matters. CPU is cumulative utime+stime from `/proc/<pid>/stat`.

| What | Processes | PSS | CPU so far | Does a rewrite change it? |
|---|---|---|---|---|
| `claude` CLI (Agent SDK binary, chat and worker screens) | 17 | 3,324 MB | 3,233 s | No: it is Anthropic's binary |
| Window renderer (xterm, board, chat, DOM) | 1 | 545 MB (569 MB private) | 3,063 s | Mostly no: the webview and xterm stay |
| Project browser tab renderers | 11 | ~517 MB together, 20–105 MB each | small | No: WebKit also runs a process per page |
| Electron main (the app's main-process TypeScript plus Electron) | 1 | 117 MB (115 MB private) | 1,652 s (2.2% of a core on average) | **Yes, this is the part Rust would replace** |
| Electron GPU process | 1 | 64 MB | 1,159 s | Partly: WebKitGTK composites too |
| Pane hosts (`pane-host-entry.js`, node, owns the ptys) | 3 | 47 MB | 53–392 s | Could become a Rust sidecar |
| Screen host (`screen-host-entry.mjs`, node, holds Agent SDK sessions) | 1 | 31 MB | 69 s | No: the Agent SDK is TS/Python only |
| `dashboard mcp` servers (node, one per claude session) | 16 | 128 MB (about 0.4 MB resident private and 15 MB swapped each) | 4 s in total | Small |
| Electron utility and zygote | 5 | 21 MB | 19 s | — |

In a 5 s `top` sample, no Electron process appeared among the top 15. Only
the `claude` processes did (0.2–3% each). At idle, the app itself costs almost
nothing.

Total under the install: about 4.9 GB PSS. Of that, about 0.9 GB is code this
repo writes, and only the 115 MB main process plus the 78 MB of hosts is code
that would be rewritten in Rust.

### Why the renderer is 569 MB

The renderer has 580 MB of dirty anonymous memory, so it is JS heap and
ArrayBuffers, not files. Every pane gets `scrollback: PANE_SCROLLBACK`
(`src/renderer/app/page.ts:370`), and `PANE_SCROLLBACK = 10000`
(`src/renderer/panes/pane.ts:34`). xterm stores each cell as `CELL_SIZE = 3`
32-bit words (`node_modules/@xterm/xterm/src/common/buffer/BufferLine.ts`), so
a full pane at 200 columns holds about 10,000 × 200 × 12 B ≈ 24 MB. Twenty
full panes come to about 480 MB.

This split is **an estimate, not a measurement**. I did not attach DevTools to
the running app, which would break the rules. `measure.mjs memory` on the demo
instance (`docs/performance/README.md`) is the way to confirm it.

### What the earlier profiling already ruled out

The earlier runs are in `docs/performance/history.md`, measured on a separate
demo instance of this checkout:

- **Startup is not slow.** Launch to five projects restored took 0.59–0.68 s,
  with first paint at 0.54–0.66 s (history.md:371). The `app.on('ready')` path
  is `src/main/main.ts:869` → `createWindow` (`main.ts:827`).
- **IPC is not heavy.** Four streams at 200 lines/s each send 78–81
  `pty:data` messages and about 120 kB a second, already batched per pty chunk.
  Idle traffic is one message every 5 s (history.md:380–385).
- **Main at ordinary output spends 58 ms of each 10 s in JavaScript**
  (history.md:386).
- **Typing latency is 23–30 ms median under every load tried** (history.md:377).
  That number includes the shell's own round trip.
- **Only a flood pins cores.** `seq 1 inf` puts main at 35–38%, the pane host
  at 65–71% (its headless copy, `pane-screen-copy.ts`) and the renderer at
  112–117%. "The renderer, drawing, is what limits the rate" (history.md:116–139).
  Back-pressure is already in place: `output-pauses.ts` with `write-flow.ts`,
  using xterm's documented watermarks of 100,000 and 10,000 characters
  ([xterm.js flow control guide](https://xtermjs.org/docs/guides/flowcontrol/)).
- **The renderer limits a streaming chat reply**: 45–51% CPU on a 16k reply,
  mostly layout (history.md:53–84). That is the browser's layout, not
  JavaScript speed.

On the live app, the window renderer has used about twice main's CPU (3,063 s
against 1,652 s) and three times the GPU's. **The renderer is where the app's
own CPU goes**, which is DOM and xterm drawing. A Rust backend does not draw
anything.

## 2. What each option would lose or have to rebuild

Size of what exists: main is 16,551 lines of code and 20,500 lines of tests,
renderer 11,015 and 6,225, shared 4,752 and 7,289, preload 126 (comment and
blank lines excluded). `vitest list` collects **3,635 tests**, not the 4,100
in the question. The docs are 109 files, 28,689 lines.

| Piece | Where it is | Tauri (Rust backend, web UI kept) | Native Rust toolkit (no web) | Rust hot paths (napi-rs or a sidecar) |
|---|---|---|---|---|
| Project browser: one `WebContentsView` per tab and a partition per project | `src/main/browser/browser-views.ts:1,201–223`, `browser-tabs.ts:108` (`persist:browser-<sha>`) | Child webviews exist only behind Tauri's `unstable` feature ([WebviewBuilder docs](https://docs.rs/tauri/latest/tauri/webview/struct.WebviewBuilder.html)). Per-project storage: `data_directory` on Linux and Windows ([wry WebContext](https://docs.rs/wry/latest/wry/struct.WebContext.html)); macOS needs `data_store_identifier`, which works only on macOS 14+ ([tauri-runtime 2.3.0 notes](https://v2.tauri.app/release/tauri-runtime/v2.3.0/)). Every sign-in is lost: the cookies sit in Chromium's store under `~/.config/Dashboard/Partitions` (186 MB here) | Has to embed a browser anyway (CEF or WebKitGTK), so the same problems apply | Unchanged |
| Browser command and MCP `browser_*` tools | `browser-views.ts:272–278` uses `webContents.debugger` with 17 CDP methods: `Input.dispatchKeyEvent`, `Input.insertText`, `Page.captureScreenshot`, `Accessibility.getFullAXTree`, `DOM.setFileInputFiles`, `Runtime.evaluate` and others | **Dead end on Linux and macOS**: WebKitGTK and WKWebView do not speak CDP. The closest thing is WebKit's WebDriver ([WebKit bug 203870](https://bugs.webkit.org/show_bug.cgi?id=203870)), so the tools would need a new design and a new implementation. Windows' WebView2 is Chromium ([Tauri webview versions](https://v2.tauri.app/reference/webview-versions/)), so there would be one backend per OS. Whether WebView2's CDP bridge covers all 17 methods: I don't know | Same as Tauri, or bundle CEF | Unchanged |
| xterm.js and its addons (`@xterm/xterm` 6.0, fit, serialize, headless) | 5 renderer files import it; the headless copy lives in the pane host | Kept, but it runs in WebKitGTK on Linux and WKWebView on macOS, a third and fourth engine to test layout, fonts, IME and the bidi checks against (`text-direction.test.ts`). How xterm's DOM renderer performs on WebKitGTK compared with Chromium: I don't know, and nothing measured here says | Rebuild the terminal on `alacritty_terminal` or `wezterm-term`, plus selection, links, fit, serialize, and the paused-selection fixes from history.md | Unchanged |
| node-pty and the pane host | `src/main/panes/pane-shell.ts`, `pane-shells.ts`, `host-socket.ts`, `pane-host-client.ts`; forge unpacks `spawn-helper` and conpty (`forge.config.ts:10–35`) | `portable-pty` ([docs.rs](https://docs.rs/portable-pty)) covers spawning on all three OSes. The pane-host protocol, survivor replay and pause leases get reimplemented | Same | A Rust pane host is a natural sidecar, since it is already a separate process with a protocol (`pane-host-protocol.ts`) |
| Agent SDK chat and worker screens | `src/main/workers/screen-host-*.ts`, `src/shared/chat/*` import `@anthropic-ai/claude-agent-sdk` | **No Rust SDK.** The SDK is "Python and TypeScript" only, and for other languages the docs say to drive the CLI as a subprocess ([Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview)). So either Node stays as a sidecar (then Node, the SDK and its 300 MB CLIs are all still there) or the stream-json protocol, hooks, elicitation and permissions are reimplemented against an undocumented-in-Rust wire format that changes with each CLI release (the SDK is pinned at `0.3.316`) | Same | Unchanged |
| MCP server and command CLIs (`board`, `dashboard`, `session`, `create-task`) | `src/main/command/*`, `vite.*-cli.config.ts`; run by `node` from `app.asar.unpacked` | With no Node shipped, they become Rust binaries; otherwise Node ships as well | Same | Unchanged |
| 3,635 Vitest tests | `src/**/*.test.ts` | Main's 20,500 lines of tests are rewritten as Rust tests; renderer and shared tests survive only if those modules stay TS and are kept in step with the Rust copies of the shared types (`src/shared/app/bridge.ts`, 383 lines of bridge surface) | All of them | Unchanged; a Rust addon adds its own `cargo test` |
| docs/ pattern, hard rules, lint holds | `docs/*/hard-rules.md`, `eslint.config.mjs` (process import boundaries, `max-lines`), `bypasses.test.ts` | Rules enforced by eslint and Vitest (actions-rule-1, errors-rule-1, app-rule-2) need Rust equivalents (clippy lints, module visibility) or become unenforced. Every feature README naming a `.ts` file is rewritten | All | One new doc |
| Packaging | `forge.config.ts`: Squirrel, zip (darwin, linux), deb, rpm; macOS self-signed "Dashboard Local", ad hoc in CI | Tauri's bundler makes deb, rpm, AppImage, msi/nsis and dmg; signing is set up again | Write it yourself (cargo-dist or similar) | A prebuilt `.node` per OS and arch in CI, built against Electron's ABI ([Electron native code](https://electronjs.org/docs/latest/tutorial/native-code-and-electron)) |
| Auto-update | `src/main/update/install.ts` (zip download, size check, swap) and `release.ts`; Squirrel on Windows | Tauri's updater plugin wants signed update artifacts and a manifest: a different release format, so the jump from the last Electron version needs a one-off bridge | Write it yourself | Unchanged |
| Remote host / second screen (ws) | `src/main/remote-host/`, `ws` | Rewrite in Rust (tokio-tungstenite) | Same | Unchanged |

## 3. Dead ends

1. **CDP is gone on Linux and macOS.** This is the decisive one. The project
   browser's agent tools (snapshot, click, type, screenshot, upload, eval) are
   17 CDP calls through `webContents.debugger` (`browser-views.ts:272–278`).
   WebKitGTK and WKWebView offer WebDriver-style automation at best, with no
   `Accessibility.getFullAXTree` equivalent that I could find, and I could not
   confirm a CDP server in WebKitGTK at all
   ([search trail, WebKit bug 203870](https://bugs.webkit.org/show_bug.cgi?id=203870)).
   What you would see: on Linux, `browser_snapshot` and `browser_screenshot`
   stop working until a WebDriver backend is written, and on Windows they work
   through a different backend.
2. **Sites render and sign in differently.** On Linux the project browser
   becomes WebKitGTK, with whatever version the distro ships
   ([Tauri webview versions](https://v2.tauri.app/reference/webview-versions/)).
   Google-style sign-ins and sites that sniff for Chrome may refuse or degrade
   it. That is a common report, but I have no measurement of it, so treat it
   as a risk, not a fact. Every existing sign-in is lost either way, because
   the Chromium cookie store cannot be migrated into WebKit.
3. **Separate project sign-ins are fragile on macOS.** `data_directory` is not
   available in WKWebView. Its replacement, `data_store_identifier`, needs
   macOS 14+ ([tauri-runtime 2.3.0](https://v2.tauri.app/release/tauri-runtime/v2.3.0/)),
   so older Macs would share one cookie jar across projects. That breaks
   browser-tabs.ts:105–109's promise that "a sign-in in one project is never
   seen by another".
4. **Child webviews are `unstable`.** The browser overlays the window as a
   native view (`browser-rule-1`). In Tauri that means `Window::add_child`,
   gated behind the `unstable` feature and with a regression already fixed
   once ([tauri#11452](https://github.com/tauri-apps/tauri/issues/11452)).
5. **Node does not go away.** The Agent SDK is TS/Python only. If the app keeps
   its chat screens, a Node sidecar ships beside Rust, so you still carry two
   runtimes plus WebKit. The memory win shrinks to Electron main's 115 MB
   against Node's roughly 30–80 MB.
6. **Three engines instead of one.** Today every OS renders in Chromium 45's
   engine. With Tauri you get WebKitGTK, WKWebView and Chromium-WebView2, and
   there is no DOM test environment here (CLAUDE.md: "There is no DOM test
   environment"), so every layout regression is found by hand three times.
7. **A native toolkit still needs a browser.** It rebuilds the terminal,
   markdown chat and board, and then embeds CEF or WebKit for the project
   browser anyway. You keep the hardest dependency and lose the rest.
8. **A napi-rs addon brings back the native-build pain** that
   `scripts/node-pty-built.mjs` and the Windows `rebuildConfig` workaround
   (`forge.config.ts`, "Windows rebuilds nothing") already handle for one
   module. N-API keeps the ABI stable, but CI has to build every OS and arch.

## 4. The cheaper route

### Rust hot paths: none justified today

| Candidate | Evidence it is hot | Verdict |
|---|---|---|
| Pane host's headless copy (`pane-screen-copy.ts`) | 65–71% of a core during `seq 1 inf` (history.md:118), near zero at ordinary output | A Rust `vte`/`alacritty_terminal` sidecar would cut that, but only during floods, and the renderer is the bottleneck then anyway. Skip it |
| Usage sweep (`src/main/usage/usage-store.ts`) | 14–17 CPU-s per launch, already on a worker thread, holding main 1–2 ms (history.md:181–207) | The fix is the cache history.md:205 names (save per-file counts in userData). It is I/O-bound reading 4.6 GB, so Rust only parses faster what should not be reread at all |
| pty → IPC → renderer | 120 kB/s at heavy load, main 58 ms per 10 s | Not hot |

### TypeScript fixes that would actually show

1. **Renderer memory (largest app-owned number, 569 MB).** First measure the
   real split with `measure.mjs memory` on the demo. If scrollback dominates,
   lower `PANE_SCROLLBACK` for workers, or trim hidden and folded panes.
   Example: halving it to 5,000 lines would free roughly half of an estimated
   ~480 MB. That is unverified.
2. **Stop idle Claude sessions.** This is still open (history.md:283–288,
   "idle stop not done"). With 17 CLIs at 230–350 MB RSS each, every idle one
   stopped frees about as much as Electron main uses in total.
3. **Close or discard idle browser tabs.** 11 tab renderers hold about 517 MB.
   Any engine pays per page.
4. **Cache the usage sweep** (history.md:205): 15 CPU-s saved on every launch.
5. **Manager tab rows** (finding 8, history.md:346–353): 88–184 ms per switch.
   It is not marked fixed in history.md, so check whether it is still current.

## 5. Recommendation and rough cost

Rough estimates for one developer who knows this codebase. These are my
judgement, not a measured figure. The weeks include reaching parity with the
3,635 tests and the docs, not just getting it to run.

| Option | Rough cost | What you get | Verdict |
|---|---|---|---|
| Full native Rust (no web) | 35–50 weeks | Smaller idle footprint, but still embeds CEF or WebKit for the browser, and the claude CLIs are unchanged | No |
| Tauri, Rust backend with the TS renderer kept | 16–26 weeks, plus an open-ended fix for browser automation on Linux and macOS | About 100–200 MB less of about 4.9 GB (under 5%); browser tools broken or rebuilt per OS; all sign-ins lost; Node sidecar still needed | No |
| Rust pane host sidecar (`portable-pty` + `vte`) | 3–5 weeks | Saves pane-host CPU during floods only; no difference at ordinary output | Not now |
| napi-rs addon for the usage parse | 1–2 weeks | Smaller win than the cache | No |
| TypeScript fixes in section 4 | 1–3 weeks in total, each a small or medium PR | Targets the 3.3 GB of CLIs and the 1 GB of renderers that make up most of the footprint | **Do this** |

**Pick: stay on Electron and TypeScript.** Do items 1–3 of section 4 first.
Reconsider Rust only if a profile on the demo instance finds a main-process or
pane-host path that is CPU-bound at ordinary load. Nothing measured so far is.

## What I don't know

- How xterm.js's DOM renderer performs inside WebKitGTK compared with Chromium.
- Whether WebView2's CDP bridge supports every one of the 17 methods used.
- The exact makeup of the renderer's 569 MB. The scrollback figure is
  arithmetic, not a heap snapshot.
- Any number on macOS or Windows. Everything here is one Linux machine.
