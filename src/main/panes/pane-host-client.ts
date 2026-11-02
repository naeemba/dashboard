import { spawn as spawnProcess } from 'node:child_process';
import net from 'node:net';
import { line, lineReader, paneOfKey, type FromHost, type SpawnRequest, type Survivor, type ToHost } from './pane-host-protocol';
import { spawnShell, type PaneShell } from './pane-shell';
import { posixQuoted, taskArguments } from '../../shared/panes/shell';

// The app's half of the pane host: the shells main asks for, run in the host when there is one and in
// this process when there is not. panes-decision-1 says why, and what costs what.
export type PaneHost = {
  // Settled once the host has answered with the shells it kept, or once there is no host to ask. A
  // project opened before this would start fresh shells beside the ones it already has.
  ready: Promise<void>;
  spawn(request: SpawnRequest): PaneShell;
  // Takes back the shells the host kept for this project, each once.
  adopt(projectPath: string): { survivor: Survivor; shell: PaneShell }[];
};

type HostShell = PaneShell & { hear(message: FromHost): void; lose(): void };

// A first launch starts the host through a login shell, which takes most of a second.
const CONNECT_TRIES = 50;
const CONNECT_PAUSE_MS = 100;
// What a pane shows for a shell lost with the host, which has no exit code of its own to give.
const LOST_EXIT = 1;

export function paneHost(options: {
  socket: string;
  launch(): void;
  // The host was never reached, or went: shells from then on are this process's and die with it.
  lost(message: string): void;
}): PaneHost {
  let connection: net.Socket | null = null;
  let kept: Survivor[] = [];
  const shells = new Map<string, HostShell>();
  const send = (message: ToHost): void => { connection?.write(line(message)); };

  // The host's socket, starting the host when nothing answers on it.
  async function reachHost(): Promise<net.Socket | null> {
    let socket = await attempt(options.socket);
    if (socket !== null) return socket;
    options.launch();
    for (let tries = 0; socket === null && tries < CONNECT_TRIES; tries += 1) {
      await new Promise((resolve) => setTimeout(resolve, CONNECT_PAUSE_MS));
      socket = await attempt(options.socket);
    }
    return socket;
  }

  async function connect(): Promise<void> {
    if (process.platform === 'win32') return;
    const open = await reachHost();
    if (open === null) {
      options.lost(`No pane host answered at ${options.socket}; shells die with the app this run`);
      return;
    }
    await new Promise<void>((resolve) => {
      open.setEncoding('utf8');
      open.on('data', lineReader<FromHost>((message) => {
        if (message.type === 'panes') {
          kept = message.panes;
          connection = open;
          return resolve();
        }
        shells.get(message.key)?.hear(message);
        if (message.type === 'exit') shells.delete(message.key);
      }));
      open.on('close', () => {
        options.lost('The pane host stopped; every pane it ran has ended');
        connection = null;
        kept = [];
        for (const shell of shells.values()) shell.lose();
        shells.clear();
        resolve();
      });
    });
  }

  function track(key: string, shell: HostShell): HostShell {
    shells.set(key, shell);
    return shell;
  }

  return {
    ready: connect(),
    spawn(request) {
      if (connection === null) return spawnShell(request);
      send({ type: 'spawn', ...request });
      return track(request.key, hostShell(request.key, { pid: 0, cols: request.cols, rows: request.rows, foreground: '' }, '', send));
    },
    adopt(projectPath) {
      const taken = kept.filter((survivor) => paneOfKey(survivor.key).projectPath === projectPath);
      kept = kept.filter((survivor) => !taken.includes(survivor));
      return taken.map((survivor) => ({ survivor, shell: track(survivor.key, hostShell(survivor.key, survivor, survivor.screen, send)) }));
    },
  };
}

function attempt(socketPath: string): Promise<net.Socket | null> {
  return new Promise((resolve) => {
    const socket = net.connect(socketPath);
    socket.once('connect', () => resolve(socket));
    socket.on('error', () => resolve(null));
  });
}

// A shell the host runs, as main sees it. What arrives before main has listened is held, and handed
// over a turn later: an adopted pane's screen arrives with it, and openProject tells the renderer the
// pane exists only after it has adopted, so a byte sent at once would have no pane to land in.
export function hostShell(
  key: string,
  start: { pid: number; cols: number; rows: number; foreground: string },
  screen: string,
  send: (message: ToHost) => void,
): HostShell {
  let { pid, cols, rows, foreground } = start;
  let unheard = screen;
  let exitCode: number | undefined;
  let dataListener: ((data: string) => void) | undefined;
  let exitListener: ((event: { exitCode: number }) => void) | undefined;
  function flush(): void {
    if (dataListener !== undefined && unheard !== '') {
      const data = unheard;
      unheard = '';
      dataListener(data);
    }
    if (exitListener !== undefined && exitCode !== undefined) {
      const listener = exitListener;
      exitListener = undefined;
      listener({ exitCode });
    }
  }
  return {
    get pid() { return pid; },
    get process() { return foreground; },
    get cols() { return cols; },
    get rows() { return rows; },
    kept: true,
    write: (data) => send({ type: 'write', key, data }),
    resize(nextCols, nextRows) {
      cols = nextCols;
      rows = nextRows;
      send({ type: 'resize', key, cols, rows });
    },
    kill: () => send({ type: 'kill', key }),
    onData(listener) {
      dataListener = listener;
      setImmediate(flush);
    },
    onExit(listener) {
      exitListener = listener;
      setImmediate(flush);
    },
    hear(message) {
      if (message.type === 'spawned') pid = message.pid;
      if (message.type === 'foreground') foreground = message.name;
      if (message.type === 'data') unheard += message.data;
      if (message.type === 'exit') exitCode = message.code;
      flush();
    },
    lose() {
      exitCode ??= LOST_EXIT;
      flush();
    },
  };
}

// Starts the host detached, through the user's login shell: the host runs on the `node` a pane's
// shell finds, which an app started from a launcher does not have on its PATH. node-pty's binary is
// N-API, so the copy the app ships loads there too. No shell to ask means no host.
export function launchPaneHost(shell: string | undefined, entry: string, socket: string, home: string): void {
  if (!shell) return;
  const child = spawnProcess(shell, taskArguments(shell, hostCommand(entry, socket)), { detached: true, stdio: 'ignore', cwd: home });
  child.on('error', () => undefined);
  child.unref();
}

export function hostCommand(entry: string, socket: string): string {
  return `exec node ${posixQuoted(entry)} ${posixQuoted(socket)}`;
}
