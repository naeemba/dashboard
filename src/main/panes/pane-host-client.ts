import { spawn as spawnProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import net from 'node:net';
import { hostProof, line, lineReader, paneOfKey, type FromHost, type SpawnRequest, type Survivor, type ToHost } from './pane-host-protocol';
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
// How long the first answer may take. A real host answers on connect, even with megabytes of screens.
const ANSWER_WAIT_MS = 10_000;

export function paneHost(options: {
  // Null when there is no address this run (paneHostAddress).
  socket: string | null;
  // On Windows, what the host proves it holds before it is sent anything but hello.
  token?: string;
  launch(): void;
  // What answered at the socket failed the proof: it is not this app's host.
  impostor?(): void;
  // In place of ANSWER_WAIT_MS, for a test.
  answerWaitMs?: number;
  // The host was never reached, or went: shells from then on are this process's and die with it.
  lost(message: string): void;
}): PaneHost {
  let connection: net.Socket | null = null;
  let kept: Survivor[] = [];
  const shells = new Map<string, HostShell>();
  const send = (message: ToHost): void => { connection?.write(line(message)); };

  // The host's socket, starting the host when nothing answers on it.
  async function reachHost(socketPath: string): Promise<net.Socket | null> {
    let socket = await attempt(socketPath);
    if (socket !== null) return socket;
    options.launch();
    for (let tries = 0; socket === null && tries < CONNECT_TRIES; tries += 1) {
      await new Promise((resolve) => setTimeout(resolve, CONNECT_PAUSE_MS));
      socket = await attempt(socketPath);
    }
    return socket;
  }

  async function connect(): Promise<void> {
    const socketPath = options.socket;
    if (socketPath === null) {
      options.lost('The pane host\'s pipe token could not be read or made; shells die with the app this run');
      return;
    }
    const open = await reachHost(socketPath);
    if (open === null) {
      options.lost(`No pane host answered at ${socketPath}; shells die with the app this run`);
      return;
    }
    const { token } = options;
    const nonce = token === undefined ? undefined : randomBytes(16).toString('hex');
    // Anything can listen at a pipe's name; only the host can answer the nonce.
    const proven = (proof: string | undefined): boolean => token === undefined || nonce === undefined || proof === hostProof(token, nonce);
    await new Promise<void>((resolve) => {
      let settled = false;
      // Ends the wait for the first answer with this app running its shells itself.
      const turnAway = (message: string): void => {
        settled = true;
        clearTimeout(silence);
        options.lost(message);
        open.destroy();
        resolve();
      };
      // What answered is not this app's host: a wrong proof, or on Windows none at all (a close, a busy
      // without one, silence). Renewing the token gives the next launch a name nobody has seen.
      const impostor = (): void => {
        try {
          options.impostor?.();
        } catch {
          // The next launch tries the same name, and is turned down the same way.
        }
        turnAway(`Something other than the pane host answered at ${socketPath}; shells die with the app this run`);
      };
      // A real host answers at once; one that never does would hold every project from opening.
      const silence = setTimeout(() => {
        if (token !== undefined) return impostor();
        turnAway(`The pane host at ${socketPath} did not answer; shells die with the app this run`);
      }, options.answerWaitMs ?? ANSWER_WAIT_MS);
      open.setEncoding('utf8');
      open.write(line({ type: 'hello', nonce }));
      open.on('data', lineReader<FromHost>((message) => {
        if (message.type === 'busy' || message.type === 'panes') {
          if (settled) return;
          if (!proven(message.proof)) return impostor();
          if (message.type === 'busy') {
            return turnAway(`Another Dashboard on the same user data holds the pane host at ${socketPath}; shells die with the app this run`);
          }
          settled = true;
          clearTimeout(silence);
          kept = message.panes;
          connection = open;
          return resolve();
        }
        shells.get(message.key)?.hear(message);
        if (message.type === 'exit') shells.delete(message.key);
      }));
      open.on('close', () => {
        if (!settled && token !== undefined) return impostor();
        if (settled && connection !== open) return;
        settled = true;
        clearTimeout(silence);
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
      // The shell itself is in the foreground until the host's first reading says otherwise. An empty
      // name would read as a program to the busy check, and a pane at its prompt would refuse a ship.
      return track(request.key, hostShell(request.key, { pid: 0, cols: request.cols, rows: request.rows, foreground: request.file }, '', send));
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
    pause: () => send({ type: 'pause', key }),
    resume: () => send({ type: 'resume', key }),
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

// Starts the host detached, as hostLaunch says. No way to start one means no host.
export function launchPaneHost(shell: string | undefined, entry: string, socket: string, home: string, tokenFile?: string): void {
  const launch = hostLaunch(process.platform, shell, entry, socket, tokenFile);
  if (launch === null) return;
  // windowsHide: detached on Windows gives the host a console window of its own, which would sit open.
  const child = spawnProcess(launch.file, launch.args, { detached: true, stdio: 'ignore', cwd: home, windowsHide: true });
  child.on('error', () => undefined);
  child.unref();
}

// Through the user's login shell on a mac or Linux: the host runs on the `node` a pane's shell finds,
// which an app started from a launcher does not have on its PATH. node-pty's binary is N-API, so the
// copy the app ships loads there too. Windows hands every app the PATH the user set, and has no POSIX
// shell to read hostCommand, so `node` is started straight, with the file holding the pipe's token.
export function hostLaunch(platform: string, shell: string | undefined, entry: string, socket: string, tokenFile?: string): { file: string; args: string[] } | null {
  if (platform === 'win32') return { file: 'node', args: tokenFile === undefined ? [entry, socket] : [entry, socket, tokenFile] };
  if (!shell) return null;
  return { file: shell, args: taskArguments(shell, hostCommand(entry, socket)) };
}

export function hostCommand(entry: string, socket: string): string {
  return `exec node ${posixQuoted(entry)} ${posixQuoted(socket)}`;
}
