// What every measurement in measure.mjs is built from: launching the demo instance, talking to it over the
// DevTools protocol, pressing keys in it, and reading CPU and private memory per process from /proc.
// docs/performance/README.md says how the demo is staged and why it never touches the installed app.
/* global process, fetch, WebSocket, setTimeout, URL */
import { spawn } from 'node:child_process';
import { copyFileSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { isDemoProcess, keyEvent, spread } from './calculations.mjs';

// Not 9222 or 9333: the installed app may already be listening on either, and a probe that lands on it
// is a probe of the running app.
export const RENDERER_PORT = 9433;
export const MAIN_PORT = 9434;
export const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const here = path.dirname(new URL(import.meta.url).pathname);

// --- the DevTools protocol -------------------------------------------------------------------------

export async function connect(port, pick = (target) => target.type === 'page' || target.type === 'node') {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target = targets.find(pick);
  if (!target) throw new Error(`no target on port ${port}`);
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let next = 1;
  const waiting = new Map();
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    const pending = waiting.get(message.id);
    if (!pending) return;
    waiting.delete(message.id);
    if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
    else pending.resolve(message.result);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = next++;
    waiting.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails).slice(0, 800));
    return result.result.value;
  };
  return { send, evaluate, close: () => socket.close() };
}

export const connectRenderer = () => connect(RENDERER_PORT, (target) => target.type === 'page');
export const connectMain = () => connect(MAIN_PORT);

// --- the demo instance -----------------------------------------------------------------------------

// Tries `attempt` until it succeeds, or throws once `timeoutMs` has gone by.
export async function retry(attempt, timeoutMs = 30000, everyMs = 20) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try { return await attempt(); } catch (error) { if (Date.now() > deadline) throw error; await wait(everyMs); }
  }
}

// Every process of the demo: the instance's process group (Electron's main writes its process title over
// both its command line and its environment, so only the group finds it), anything carrying
// `--user-data-dir=<demo>/userdata`, and the panes, which run in sessions of their own (setsid) but inherit
// the HOME launch-demo.sh set. No unrelated process has that HOME.
function demoProcesses(demo, group) {
  const marks = { group, home: path.resolve(demo, 'home'), userData: path.resolve(demo, 'userdata') };
  const read = (pid, file) => { try { return readFileSync(`/proc/${pid}/${file}`, 'utf8'); } catch { return ''; } };
  return readdirSync('/proc').filter((entry) => /^\d+$/.test(entry) && Number(entry) !== process.pid)
    .filter((pid) => {
      let processGroup;
      try { processGroup = Number(statFields(pid)[2]); } catch { return false; }
      return isDemoProcess({ processGroup, commandLine: read(pid, 'cmdline'), environment: read(pid, 'environ') }, marks);
    }).map(Number);
}

export async function killDemo(demo, group) {
  for (const signal of ['SIGTERM', 'SIGKILL']) {
    for (const pid of demoProcesses(demo, group)) { try { process.kill(pid, signal); } catch { /* already gone */ } }
    const deadline = Date.now() + 5000;
    while (demoProcesses(demo, group).length > 0 && Date.now() < deadline) await wait(100);
    if (demoProcesses(demo, group).length === 0) return;
  }
}

// Starts the demo from the staged folder with the layout and remembered chats given, waits for the
// window, runs `measure(instance)`, and always tears the whole demo down after, Ctrl+C included. It
// refuses to start while anything already answers on either of the demo's ports: that would be the
// instance a run before this one left behind, or another process's inspector on 9434, and every number
// would be read off it.
export async function withInstance(demo, options, measure) {
  const { session = 'session-5.json', chats = 'chat-sessions-long.json', settle = 15000, onSpawn } = options;
  const answers = (connection) => connection().then((target) => (target.close(), true), () => false);
  for (const [port, connection] of [[RENDERER_PORT, connectRenderer], [MAIN_PORT, connectMain]]) {
    if (await answers(connection)) throw new Error(`something already answers on ${port}; stop it first (an earlier demo run?)`);
  }
  copyFileSync(path.join(demo, session), path.join(demo, 'userdata', 'session.json'));
  copyFileSync(path.join(demo, chats), path.join(demo, 'userdata', 'chat-sessions.json'));
  let group;
  const interrupted = () => { void killDemo(demo, group).finally(() => process.exit(130)); };
  process.once('SIGINT', interrupted);
  process.once('SIGTERM', interrupted);
  const startedAt = Date.now();
  const child = spawn(path.join(here, 'launch-demo.sh'), [demo], { stdio: 'ignore', detached: true });
  child.unref();
  group = child.pid;
  let page;
  try {
    // Awaited together, so a rejection from onSpawn reaches the finally instead of crashing the run
    // with the demo left up.
    const spawned = onSpawn?.(startedAt);
    [page] = await Promise.all([retry(connectRenderer), spawned]);
    await wait(settle);
    return await measure({ page, startedAt });
  } finally {
    page?.close();
    await killDemo(demo, group);
    process.off('SIGINT', interrupted);
    process.off('SIGTERM', interrupted);
  }
}

// --- keys ------------------------------------------------------------------------------------------

// One chord, `Ctrl+Shift+T`, `Alt+2`, `ArrowDown`, `x`, as the window would get it from a keyboard.
export async function press(page, chord) {
  const { base, text } = keyEvent(chord);
  await page.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', ...base, ...(text ? { text, unmodifiedText: text } : {}) });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}

export async function keys(page, ...chords) {
  for (const chord of chords) { await press(page, chord); await wait(300); }
}

// Types a command into the focused pane and runs it.
export async function run(page, command) {
  await page.send('Input.insertText', { text: command });
  await press(page, 'Enter');
  await wait(300);
}

// --- CPU and memory from /proc ---------------------------------------------------------------------

const CLOCK_TICKS = 100;
// /proc/<pid>/stat after the command name, which is in parentheses and may hold spaces: state, ppid, ...
function statFields(pid) {
  const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
  return stat.slice(stat.lastIndexOf(')') + 2).split(' ');
}
const cpuTicks = (pid) => { const fields = statFields(pid); return Number(fields[11]) + Number(fields[12]); };

// Private memory is what a process holds alone; summed RSS counts every shared page once per process.
function privateMemory(pid) {
  try {
    const rollup = readFileSync(`/proc/${pid}/smaps_rollup`, 'utf8');
    const field = (name) => Number(rollup.match(new RegExp(`^${name}:\\s+(\\d+)`, 'm'))?.[1] ?? 0);
    return { privateMB: +((field('Private_Clean') + field('Private_Dirty')) / 1024).toFixed(1), pssMB: +(field('Pss') / 1024).toFixed(1) };
  } catch {
    return { privateMB: 0, pssMB: 0 };
  }
}

// Electron's own processes, named the way app.getAppMetrics names them. Pids and names only: reading
// memory walks each process's page tables, which a CPU window should not pay for.
async function electronPids() {
  const main = await connectMain();
  const metrics = await main.evaluate(`process.mainModule.require('electron').app.getAppMetrics().map((m) => ({ pid: m.pid, type: m.type, service: m.serviceName }))`);
  main.close();
  return metrics.map((metric) => ({ ...metric, name: metric.service || metric.type }));
}

// Everything main has started, grouped: the Agent SDK's claude CLI per page, shells, what runs in them.
function childProcesses(mainPid, skip) {
  const all = readdirSync('/proc').filter((entry) => /^\d+$/.test(entry)).flatMap((pid) => {
    try {
      return [{ pid: Number(pid), parent: Number(statFields(pid)[1]), command: readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0')[0] }];
    } catch { return []; }
  });
  const children = new Map();
  for (const entry of all) children.set(entry.parent, [...(children.get(entry.parent) ?? []), entry]);
  const found = [];
  const walk = (pid) => { for (const child of children.get(pid) ?? []) { if (!skip.has(child.pid)) found.push(child); walk(child.pid); } };
  walk(mainPid);
  const kind = (command) => command.includes('claude-agent-sdk') ? 'agent-sdk claude CLI' : /(^|\/)(zsh|bash|sh)$/.test(command) ? 'shell' : path.basename(command);
  const groups = new Map();
  for (const child of found) {
    const name = kind(child.command);
    const group = groups.get(name) ?? { name, count: 0, privateMB: 0 };
    group.count++; group.privateMB = +(group.privateMB + privateMemory(child.pid).privateMB).toFixed(1);
    groups.set(name, group);
  }
  return [...groups.values()];
}

export async function memory() {
  const electron = (await electronPids()).map((entry) => ({ ...entry, ...privateMemory(entry.pid) }));
  const main = electron.find((entry) => entry.type === 'Browser');
  return { electron, children: childProcesses(main.pid, new Set(electron.map((entry) => entry.pid))) };
}

// The demo's pane host, the node process outside Electron that runs the worker panes' ptys
// (docs/panes, panes-decision-1), or nothing when this run has none.
export function paneHostPids(demo) {
  const socketFolder = path.resolve(demo, 'userdata', 'pane-host');
  return readdirSync('/proc').filter((entry) => /^\d+$/.test(entry)).flatMap((pid) => {
    try {
      const commandLine = readFileSync(`/proc/${pid}/cmdline`, 'utf8');
      return commandLine.includes('pane-host-entry') && commandLine.includes(socketFolder) ? [{ pid: Number(pid), name: 'pane-host' }] : [];
    } catch { return []; }
  });
}

// CPU % per Electron process over a window, with the renderer's own split of where its time went.
// `others` are processes outside Electron to count beside them, such as the pane host.
export async function cpuWindow(seconds, others = []) {
  const processes = [...(await electronPids()), ...others];
  const page = await connectRenderer();
  await page.send('Performance.enable');
  await page.evaluate(`window.__longTasks = []; window.__longTaskObserver?.disconnect(); window.__longTaskObserver = new PerformanceObserver((list) => { for (const entry of list.getEntries()) window.__longTasks.push(Math.round(entry.duration)); }); window.__longTaskObserver.observe({ type: 'longtask' }); true`);
  const metrics = async () => Object.fromEntries((await page.send('Performance.getMetrics')).metrics.map((metric) => [metric.name, metric.value]));
  const ticksBefore = processes.map((entry) => cpuTicks(entry.pid));
  const before = await metrics();
  await wait(seconds * 1000);
  const ticksAfter = processes.map((entry) => cpuTicks(entry.pid));
  const after = await metrics();
  const longTasks = await page.evaluate('window.__longTasks');
  page.close();
  const share = (name) => +(100 * (after[name] - before[name]) / seconds).toFixed(1);
  return {
    cpuPercent: Object.fromEntries(processes.map((entry, index) => [entry.name, +(100 * (ticksAfter[index] - ticksBefore[index]) / CLOCK_TICKS / seconds).toFixed(1)])),
    renderer: {
      taskPercent: share('TaskDuration'), scriptPercent: share('ScriptDuration'), layoutPercent: share('LayoutDuration'), stylePercent: share('RecalcStyleDuration'),
      layouts: after.LayoutCount - before.LayoutCount, styleRecalculations: after.RecalcStyleCount - before.RecalcStyleCount,
      longTasks: longTasks.length, longestTask: Math.max(0, ...longTasks), heapMB: +(after.JSHeapUsedSize / 1048576).toFixed(1), nodes: after.Nodes,
    },
  };
}

// --- latency ---------------------------------------------------------------------------------------

// Keystroke to the first frame after the focused pane's rows change: the echo's whole trip, renderer to
// main to the pty to the shell and back.
const ECHO_PROBE = `(() => {
  window.__echo = [];
  if (window.__echoInstalled) return true;
  window.__echoInstalled = true;
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'x' && event.key !== 'Backspace') return;
    const start = event.timeStamp;
    const rows = document.activeElement?.closest('.xterm')?.querySelector('.xterm-rows');
    if (!rows) return;
    const observer = new MutationObserver(() => {
      observer.disconnect();
      requestAnimationFrame((frame) => window.__echo.push(Math.round(frame - start)));
    });
    observer.observe(rows, { childList: true, subtree: true, characterData: true });
    setTimeout(() => observer.disconnect(), 2000);
  }, true);
  return true;
})()`;

export async function echoLatency(page, samples = 20) {
  await page.evaluate(ECHO_PROBE);
  for (let index = 0; index < samples; index++) {
    await press(page, index % 2 ? 'Backspace' : 'x');
    await wait(250);
  }
  return spread(await page.evaluate('window.__echo'));
}

// Input to next paint per key press, from the Event Timing API: the handler plus the render up to the
// frame that shows it. Only presses over 16 ms are reported by the browser, so a fast one is "<16".
export async function keyToPaint(page, chords) {
  await page.evaluate(`window.__keyEvents = []; window.__keyObserver?.disconnect(); window.__keyObserver = new PerformanceObserver((list) => { for (const entry of list.getEntries()) if (entry.name === 'keydown') window.__keyEvents.push({ duration: Math.round(entry.duration), handler: Math.round(entry.processingEnd - entry.processingStart) }); }); window.__keyObserver.observe({ type: 'event', durationThreshold: 16 }); true`);
  for (const chord of chords) { await press(page, chord); await wait(400); }
  await wait(500);
  const events = await page.evaluate('window.__keyEvents');
  return { presses: chords.length, over16ms: events.length, ...spread(events.map((event) => event.duration)), inOrder: events.map((event) => event.duration), handler: events.map((event) => event.handler) };
}
