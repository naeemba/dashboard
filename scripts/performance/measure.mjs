// node scripts/performance/measure.mjs <measurement> <demo folder> [...]: one measurement against a fresh demo
// instance, printed as one JSON line per step. docs/performance/README.md lists them and what each found.
/* global process, performance, console, URL, setInterval, clearInterval */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { bytesPerSource, ownerOf } from './calculations.mjs';
import {
  connectMain, cpuWindow, echoLatency, keys, keyToPaint, memory, press, retry, run, wait, withInstance,
} from './demo-instance.mjs';

const [measurement, demo, ...rest] = process.argv.slice(2);
const here = path.dirname(new URL(import.meta.url).pathname);
const stream = path.join(here, 'build-log-stream.sh');
const print = (step, value) => console.log(JSON.stringify({ step, ...value }));

// Tab 1 is the manager; alpha is Ctrl+2, beta Ctrl+3, gamma Ctrl+4. Ctrl+T is the terminals view,
// Ctrl+Shift+T a new worker, Alt+2 the first worker in the list.

// <count> new workers on the page in front, the first of them focused.
async function openWorkers(page, count = 1) {
  await keys(page, 'Ctrl+T', ...Array(count).fill('Ctrl+Shift+T'));
  await wait(1500);
  await keys(page, 'Alt+2');
}

// A build log in each of the first <count> workers, <rate> lines a second each.
async function startStreams(page, count, rate) {
  for (let position = 2; position < 2 + count; position++) { await keys(page, `Alt+${position}`); await run(page, `${stream} ${rate}`); }
}

// The highest line number each worker on screen has drawn: build-log-stream.sh numbers its lines, so a
// pane that came back showing what it printed while hidden reads higher than when it left. A worker
// scrolled out of the list is off screen too, so xterm draws it only once it is scrolled back into view.
const DRAWN_LINES = `[...document.querySelectorAll('.page:not([hidden]) .view:not([hidden]) .workers .xterm-rows')]
  .filter((rows) => {
    const box = rows.getBoundingClientRect(), list = rows.closest('.workers').getBoundingClientRect();
    return box.bottom > list.top && box.top < list.bottom;
  })
  .map((rows) => Math.max(0, ...(rows.textContent.match(/\\d{6}/g) ?? []).map(Number)))`;

// GC first, then what the renderer and main hold: heap, DOM, listeners, private memory per process.
async function heldMemory(page, main) {
  await page.send('HeapProfiler.collectGarbage'); await main.send('HeapProfiler.collectGarbage');
  const counters = await page.send('Memory.getDOMCounters');
  const { electron, children } = await memory();
  const privateOf = (type) => electron.find((entry) => entry.type === type)?.privateMB;
  return {
    mainPrivateMB: privateOf('Browser'), rendererPrivateMB: privateOf('Tab'), gpuPrivateMB: privateOf('GPU'),
    cliPrivateMB: children.find((group) => group.name === 'agent-sdk claude CLI')?.privateMB,
    cliProcesses: children.find((group) => group.name === 'agent-sdk claude CLI')?.count ?? 0,
    rendererHeapMB: +((await page.evaluate('performance.memory.usedJSHeapSize')) / 1048576).toFixed(1),
    mainHeapMB: +((await main.evaluate('process.memoryUsage().heapUsed')) / 1048576).toFixed(1),
    nodes: counters.nodes, listeners: counters.jsEventListeners,
  };
}

const measurements = {
  // Launch to window, first paint and every restored project; with long chats, alpha's chat drawn too.
  async startup(runs = '3', chats = 'chat-sessions-none.json') {
    const logFile = path.join(demo, 'userdata', 'dashboard.log');
    for (let index = 0; index < Number(runs); index++) {
      await withInstance(demo, { chats, settle: 0 }, async ({ page, startedAt }) => {
        let chatDrawn = NaN;
        if (chats !== 'chat-sessions-none.json') {
          await retry(async () => {
            const entries = await page.evaluate(`document.querySelectorAll('.page')[1]?.querySelectorAll('.chat-entry').length ?? 0`);
            if (entries <= 20) throw new Error('not drawn yet');
          }, 30000);
          chatDrawn = Date.now() - startedAt;
        }
        const timing = await page.evaluate(`({ origin: performance.timeOrigin, paint: performance.getEntriesByName('first-contentful-paint')[0]?.startTime })`);
        await wait(1500);
        // This run's lines only: the log is appended to across runs.
        const entries = readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)).filter((entry) => Date.parse(entry.time) >= startedAt);
        const at = (entry) => (entry ? Date.parse(entry.time) - startedAt : NaN);
        const opened = entries.filter((entry) => entry.message === 'opened');
        print('startup', {
          appReady: at(entries.find((entry) => entry.message?.startsWith('started'))),
          firstContentfulPaint: Math.round(timing.origin - startedAt + timing.paint),
          firstProjectOpened: at(opened[0]), lastProjectOpened: at(opened.at(-1)), projects: opened.length,
          ...(Number.isNaN(chatDrawn) ? {} : { alphaChatDrawn: chatDrawn }),
        });
      });
    }
  },

  // Four workers on alpha streaming <rate> lines a second each: CPU shown, CPU hidden, typing beside them.
  streams: (rate = '200') => withInstance(demo, {}, async ({ page }) => {
    print('idle', await cpuWindow(10));
    await openWorkers(page, 4);
    await startStreams(page, 4, rate);
    await wait(3000);
    print('four-streams-shown', await cpuWindow(10));
    await keys(page, 'Ctrl+Shift+T'); await wait(1500); await keys(page, 'Alt+6'); await wait(500);
    print('typing-beside-four-streams', await echoLatency(page));
    const drawnWhenLeft = await page.evaluate(DRAWN_LINES);
    const leftAt = Date.now();
    await keys(page, 'Ctrl+4'); await wait(1000);
    await openWorkers(page); await wait(500);
    print('four-streams-hidden', await cpuWindow(10));
    print('typing-other-project', await echoLatency(page));
    await keys(page, 'Ctrl+2'); await wait(300);
    const drawnOnReturn = await page.evaluate(DRAWN_LINES);
    // Every pane should have moved on by about <rate> lines per second it was away.
    print('back-on-alpha', { hiddenSeconds: Math.round((Date.now() - leftAt) / 1000), drawnWhenLeft, drawnOnReturn });
    await keys(page, 'Ctrl+4'); await wait(500);
    const main = await connectMain();
    await main.send('Profiler.enable'); await main.send('Profiler.start');
    await wait(10000);
    writeFileSync(path.join(demo, 'streams-main.cpuprofile'), JSON.stringify((await main.send('Profiler.stop')).profile));
    main.close();
    print('memory', await memory());
  }),

  // One worker running `seq` flat out, shown or hidden; then Ctrl+C and how long the pane keeps printing.
  // `seq 1 inf` never ends on its own, so a pane that stops printing is one the interrupt reached.
  flood: (where = 'shown') => withInstance(demo, {}, async ({ page }) => {
    const lastLine = String.raw`(() => { const page = document.querySelectorAll('.page')[1]; for (const rows of page.querySelectorAll('.xterm-rows')) { const lines = [...rows.children].map((row) => row.textContent.trim()).filter(Boolean); if (lines.some((line) => /^\d{3,}$/.test(line))) return lines.at(-1); } return ''; })()`;
    await openWorkers(page);
    await run(page, 'seq 1 inf');
    if (where === 'hidden') await keys(page, 'Ctrl+4');
    await wait(2000);
    // CPU first with nothing attached, then profiles over a window of their own, so sampling does not
    // add to the CPU figures.
    print(`flood-${where}`, await cpuWindow(5));
    const main = await connectMain();
    await main.send('Profiler.enable'); await page.send('Profiler.enable');
    await main.send('Profiler.start'); await page.send('Profiler.start');
    await wait(5000);
    writeFileSync(path.join(demo, `flood-${where}-main.cpuprofile`), JSON.stringify((await main.send('Profiler.stop')).profile));
    writeFileSync(path.join(demo, `flood-${where}-renderer.cpuprofile`), JSON.stringify((await page.send('Profiler.stop')).profile));
    main.close();
    if (where === 'hidden') await keys(page, 'Ctrl+2');
    await keys(page, 'Alt+2');
    const pressedAt = Date.now();
    await press(page, 'Ctrl+C');
    let previous = await page.evaluate(lastLine);
    let changedAt = Date.now();
    while (Date.now() - changedAt < 2000 && Date.now() - pressedAt < 120000) {
      await wait(100);
      const now = await page.evaluate(lastLine);
      if (now !== previous) { previous = now; changedAt = Date.now(); }
    }
    print('ctrl-c', { keptPrintingMs: changedAt - pressedAt, stopped: Date.now() - changedAt >= 2000, lastLine: previous });
    print('after', await cpuWindow(5));
  }),

  // A long answer streamed into alpha's Claude screen as the SDK's text_delta events, sent from main the
  // way chat-sessions.ts relays them. No model is called. 600 characters a second by default.
  chat: (characters = '16000', perDelta = '12', everyMs = '20') => withInstance(demo, {}, async () => {
    let answer = readFileSync(path.join(demo, 'answer.md'), 'utf8');
    while (answer.length < Number(characters)) answer += '\n\n' + answer;
    answer = answer.slice(0, Number(characters));
    const main = await connectMain();
    // Slot 0 is the first project opened, alpha.
    await main.evaluate(`(() => { const text = ${JSON.stringify(answer)}; const contents = process.mainModule.require('electron').BrowserWindow.getAllWindows()[0].webContents; let at = 0;
      contents.send('chat:receive', 0, { kind: 'message', message: { type: 'stream_event', event: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } } } });
      const timer = setInterval(() => { if (at >= text.length) return clearInterval(timer); contents.send('chat:receive', 0, { kind: 'message', message: { type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: text.slice(at, at + ${Number(perDelta)}) } } } }); at += ${Number(perDelta)}; }, ${Number(everyMs)}); return true; })()`);
    main.close();
    const seconds = Math.min(60, Math.ceil(Number(characters) / Number(perDelta) * Number(everyMs) / 1000));
    print(`chat-stream-${characters}`, { seconds, ...(await cpuWindow(seconds)) });
  }),

  // Input to next paint for the board's arrows and for tab switches, on alpha's 153-card board, then idle
  // CPU with a terminal focused, which is the cursor blinking.
  keys: () => withInstance(demo, {}, async ({ page }) => {
    print('board-open', await keyToPaint(page, ['Ctrl+B']));
    print('board-arrow-down', await keyToPaint(page, Array(15).fill('ArrowDown')));
    print('board-arrow-sideways', await keyToPaint(page, ['ArrowRight', 'ArrowRight', 'ArrowLeft', 'ArrowLeft']));
    await keys(page, 'Ctrl+T');
    print('tab-switch beta alpha gamma alpha manager alpha delta alpha', await keyToPaint(page, ['Ctrl+3', 'Ctrl+2', 'Ctrl+4', 'Ctrl+2', 'Ctrl+1', 'Ctrl+2', 'Ctrl+5', 'Ctrl+2']));
    await openWorkers(page);
    print('cursor-blink-terminal-focused', await cpuWindow(10));
  }),

  // Messages and bytes per IPC channel, both ways, with four workers streaming 200 lines a second.
  // ipcRenderer.send reaches ipcMain.emit; ipcRenderer.invoke never does, so every registered handle
  // is wrapped as well, its arguments counted to main and its answer as the reply.
  ipc: (seconds = '10') => withInstance(demo, {}, async ({ page }) => {
    await openWorkers(page, 4);
    await startStreams(page, 4, 200);
    const main = await connectMain();
    await main.evaluate(`(() => { const { BrowserWindow, ipcMain } = process.mainModule.require('electron');
      if (!(ipcMain._invokeHandlers instanceof Map)) throw new Error('ipcMain._invokeHandlers is gone; invoke traffic cannot be counted on this Electron');
      const contents = BrowserWindow.getAllWindows()[0].webContents;
      const size = (value) => { try { return JSON.stringify(value)?.length ?? 0; } catch { return 0; } };
      globalThis.__ipc = {}; const count = (name, value) => { const entry = globalThis.__ipc[name] ??= { messages: 0, bytes: 0 }; entry.messages++; entry.bytes += size(value); };
      globalThis.__send = contents.send; contents.send = function (channel, ...values) { count('to renderer ' + channel, values); return globalThis.__send.call(this, channel, ...values); };
      globalThis.__emit = ipcMain.emit; ipcMain.emit = function (channel, event, ...values) { count('to main ' + channel, values); return globalThis.__emit.call(this, channel, event, ...values); };
      globalThis.__handlers = new Map(ipcMain._invokeHandlers);
      for (const [channel, handler] of globalThis.__handlers) ipcMain._invokeHandlers.set(channel, async function (event, ...values) { count('to main ' + channel, values); const answer = await handler.call(this, event, ...values); count('reply ' + channel, answer); return answer; });
      return true; })()`);
    await wait(Number(seconds) * 1000);
    const counted = await main.evaluate(`(() => { const { BrowserWindow, ipcMain } = process.mainModule.require('electron'); BrowserWindow.getAllWindows()[0].webContents.send = globalThis.__send; ipcMain.emit = globalThis.__emit; for (const [channel, handler] of globalThis.__handlers) ipcMain._invokeHandlers.set(channel, handler); return globalThis.__ipc; })()`);
    main.close();
    print('ipc', Object.fromEntries(Object.entries(counted).map(([channel, entry]) => [channel, { perSecond: +(entry.messages / Number(seconds)).toFixed(1), kilobytesPerSecond: +(entry.bytes / Number(seconds) / 1024).toFixed(1) }])));
  }),

  // Open and close zeta from a pane on gamma, with a snapshot after one warm-up cycle and after the rest.
  cycles: (count = '10') => withInstance(demo, {}, async ({ page }) => {
    const main = await connectMain();
    await page.send('HeapProfiler.enable'); await main.send('HeapProfiler.enable');
    const snapshot = async () => ({
      ...(await heldMemory(page, main)),
      handles: await main.evaluate(`(() => { const counted = {}; for (const handle of process._getActiveHandles()) { const name = handle.constructor?.name ?? '?'; counted[name] = (counted[name] ?? 0) + 1; } return counted; })()`),
    });
    const loop = async (times) => { await run(page, `for i in $(seq ${times}); do node "$DASHBOARD_COMMAND" project open zeta; sleep 4; node "$DASHBOARD_COMMAND" project close zeta; sleep 3; done`); await wait(times * 7500 + 3000); await keys(page, 'Ctrl+4', 'Alt+2'); };
    try {
      await keys(page, 'Ctrl+4');
      await openWorkers(page);
      print('before', await snapshot());
      await loop(1);
      print('after-1-cycle', await snapshot());
      await loop(Number(count));
      print(`after-${Number(count) + 1}-cycles`, await snapshot());
    } finally { main.close(); }
  }),

  // Main's event-loop lag from launch on: every time a 10 ms timer fires more than 50 ms late, and typing
  // into a worker the whole time. Put big logs in the demo's ~/.claude/projects first to see the sweep.
  async lag(seconds = '45') {
    let main;
    const watchMain = async (startedAt) => {
      main = await retry(connectMain, 30000, 10);
      await main.evaluate(`(() => { globalThis.__lag = []; let last = performance.now(); setInterval(() => { const now = performance.now(); const late = now - last - 10; if (late > 50) globalThis.__lag.push([Math.round(Date.now() - ${startedAt}), Math.round(late)]); last = now; }, 10).unref(); return true; })()`);
    };
    await withInstance(demo, { chats: 'chat-sessions-none.json', settle: 1500, onSpawn: watchMain }, async ({ page, startedAt }) => {
      try {
        await keys(page, 'Ctrl+Shift+T'); await wait(1000); await keys(page, 'Alt+2');
        const typing = [];
        while (Date.now() - startedAt < Number(seconds) * 1000) typing.push([Date.now() - startedAt, (await echoLatency(page, 8)).max]);
        const lag = await main.evaluate('globalThis.__lag');
        print('main-lag-over-50ms', { count: lag.length, worst: Math.max(0, ...lag.map((entry) => entry[1])), totalMs: lag.reduce((sum, entry) => sum + entry[1], 0), atAndMs: lag });
        print('typing-worst-per-2s', { atAndMs: typing });
      } finally { main.close(); }
    });
  },

  // Main-process CPU profile of the first 3 seconds after launch.
  async boot() {
    const profileMain = async () => {
      const main = await retry(connectMain, 30000, 10);
      await main.send('Profiler.enable'); await main.send('Profiler.setSamplingInterval', { interval: 200 }); await main.send('Profiler.start');
      await wait(3000);
      writeFileSync(path.join(demo, 'boot-main.cpuprofile'), JSON.stringify((await main.send('Profiler.stop')).profile));
      main.close();
    };
    await withInstance(demo, { settle: 0, onSpawn: profileMain }, async () => print('boot', { profile: path.join(demo, 'boot-main.cpuprofile') }));
  },

  // <minutes> of use: five workers streaming 50 lines a second, a tab-and-board round each minute, memory
  // sampled every minute after a garbage collection.
  soak: (minutes = '30') => withInstance(demo, {}, async ({ page }) => {
    const main = await connectMain();
    await page.send('HeapProfiler.enable'); await main.send('HeapProfiler.enable');
    try {
      await keys(page, 'Ctrl+3'); await openWorkers(page); await startStreams(page, 1, 50);
      await keys(page, 'Ctrl+2'); await openWorkers(page, 4); await startStreams(page, 4, 50);
      const started = Date.now();
      for (let minute = 0; minute <= Number(minutes); minute++) {
        print('minute', { minute, ...(await heldMemory(page, main)) });
        if (minute === Number(minutes)) break;
        await keys(page, 'Ctrl+3', 'Ctrl+1', 'Ctrl+2', 'Ctrl+B', 'ArrowDown', 'ArrowDown', 'ArrowUp', 'Ctrl+T');
        await wait(Math.max(0, started + (minute + 1) * 60000 - Date.now()));
      }
    } finally { main.close(); }
  }),

  // Memory of every process with the full load in place: Electron's, and every child of main.
  memory: () => withInstance(demo, {}, async ({ page }) => {
    await openWorkers(page, 4); await wait(1500);
    print('memory', await memory());
  }),
};

// How late a 10 ms timer on this thread fires, which is how long the whole loop was held. Stop it
// for the longest hold seen.
function holdTimer() {
  let longest = 0, last = performance.now();
  const timer = setInterval(() => { const now = performance.now(); longest = Math.max(longest, now - last - 10); last = now; }, 10);
  return () => { clearInterval(timer); return longest; };
}

// Wall time and this process's CPU (every thread's) for one piece of work.
async function timed(work) {
  const started = performance.now();
  const cpuBefore = process.cpuUsage();
  const result = await work();
  const cpu = process.cpuUsage(cpuBefore);
  return { result, seconds: +((performance.now() - started) / 1000).toFixed(1), cpuSeconds: +((cpu.user + cpu.system) / 1e6).toFixed(1) };
}

// No demo instance: the app's own sweepUsage (src/main/usage/usage-store.ts), loaded through vite, on a
// real log folder, read-only. Twice: the first sweep reads everything, the second what a later one costs.
// Then the first sweep again the way the app runs it, on the built usage-worker.js thread
// (npm run package first), where main's hold is only waiting. A project of '' takes in every log that
// named a folder, since ranInProject asks for `${path}/` as a prefix, and its tokens are checked against
// the in-process sweep's so a thread that read nothing cannot pass for a fast one. They differ by
// whatever running sessions appended in between.
async function usageSweep(root) {
  const { createServer } = await import('vite');
  const server = await createServer({ configFile: false, root: path.join(here, '..', '..'), logLevel: 'error', server: { middlewareMode: true, hmr: false } });
  const { sweepUsage } = await server.ssrLoadModule('/src/main/usage/usage-store.ts');
  const { snapshotOf } = await server.ssrLoadModule('/src/shared/usage/usage.ts');
  const { requestSweep } = await server.ssrLoadModule('/src/main/usage/usage-thread.ts');
  await server.close();
  const everything = [{ path: '', worktrees: '\0' }];
  let stop = holdTimer();
  const known = new Map();
  const first = await timed(() => sweepUsage(root, known, Date.now()));
  const later = await timed(() => sweepUsage(root, known, Date.now()));
  const longest = stop();
  const bytes = [...known.values()].reduce((sum, usage) => sum + usage.size, 0);
  print('usage-sweep', {
    files: known.size, gigabytes: +(bytes / 1073741824).toFixed(2),
    firstSweepSeconds: first.seconds, firstSweepCpuSeconds: first.cpuSeconds,
    longestHoldMs: Math.round(longest), laterSweepMs: Math.round(later.seconds * 1000),
  });
  const file = path.join(here, '..', '..', '.vite', 'build', 'usage-worker.js');
  if (!existsSync(file)) return print('usage-sweep-thread', { skipped: `${file} not built` });
  const worker = new Worker(file);
  stop = holdTimer();
  const threaded = await timed(() => requestSweep(worker, { root, now: Date.now(), projects: everything, paneSessions: new Map() }));
  const mainLongest = stop();
  await worker.terminate();
  print('usage-sweep-thread', {
    firstSweepSeconds: threaded.seconds, firstSweepCpuSeconds: threaded.cpuSeconds, mainLongestHoldMs: Math.round(mainLongest),
    allTimeTokens: threaded.result.projects[''].allTime,
    inProcessAllTimeTokens: snapshotOf(known.values(), everything, new Map(), Date.now()).projects[''].allTime,
  });
}

// Minified renderer bytes per package, from a source-mapped build into the demo folder. Bytes no source
// maps to (glue the bundler wrote) are counted as (unmapped).
function bundle() {
  const out = path.join(demo, 'renderer-build');
  execFileSync('npx', ['vite', 'build', '--config', 'vite.renderer.config.ts', '--sourcemap', '--outDir', out, '--emptyOutDir'], { cwd: path.join(here, '..', '..'), stdio: 'ignore' });
  const mapFile = path.join(out, 'assets', readdirSync(path.join(out, 'assets')).find((name) => name.endsWith('.js.map')));
  const map = JSON.parse(readFileSync(mapFile, 'utf8'));
  const owners = map.sources.map(ownerOf);
  const lines = readFileSync(mapFile.replace(/\.map$/, ''), 'utf8').split('\n');
  const bytes = new Map();
  for (const [index, count] of bytesPerSource(map.mappings, lines.map((line) => line.length))) {
    const owner = owners[index] ?? '(unmapped)';
    bytes.set(owner, (bytes.get(owner) ?? 0) + count);
  }
  const total = [...bytes.values()].reduce((sum, value) => sum + value, 0);
  print('bundle', { totalKB: Math.round(total / 1024), byOwnerKB: Object.fromEntries([...bytes].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([owner, value]) => [owner, Math.round(value / 1024)])) });
}

// Self time per function of a .cpuprofile.
function profileSummary(file, count = '15') {
  const profile = JSON.parse(readFileSync(file, 'utf8'));
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const sampleMs = (profile.endTime - profile.startTime) / profile.samples.length / 1000;
  const byFunction = new Map();
  for (const id of profile.samples) {
    const frame = nodes.get(id).callFrame;
    const where = (frame.url || '(native)').replace(/.*node_modules\//, '').replace(/.*\.vite\//, '.vite/');
    const name = `${frame.functionName || '(anonymous)'} ${where}:${frame.lineNumber + 1}`;
    byFunction.set(name, (byFunction.get(name) ?? 0) + sampleMs);
  }
  const busy = [...byFunction].filter(([name]) => !/^\((idle|program)\)/.test(name)).reduce((sum, [, ms]) => sum + ms, 0);
  console.log(`window ${Math.round((profile.endTime - profile.startTime) / 1000)} ms, busy ${Math.round(busy)} ms`);
  for (const [name, ms] of [...byFunction].sort((a, b) => b[1] - a[1]).slice(0, Number(count))) console.log(String(Math.round(ms)).padStart(7), 'ms', name);
}

if (measurement === 'usage-sweep') await usageSweep(demo);
else if (measurement === 'profile') profileSummary(demo, rest[0]);
else if (measurement === 'bundle') bundle();
else if (measurements[measurement]) await measurements[measurement](...rest);
else {
  console.log(`measurements: ${Object.keys(measurements).join(', ')}, usage-sweep <~/.claude/projects>, profile <file.cpuprofile>, bundle <demo folder>`);
  process.exitCode = 1;
}
process.exit();
