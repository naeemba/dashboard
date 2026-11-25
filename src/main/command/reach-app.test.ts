import { describe, expect, it } from 'vitest';
import { launchTimedOut, mayStartApp, NOT_RUNNING, reachApp, type ReachPorts } from './reach-app';

// A clock that moves only when the command sleeps, and an app that starts listening some time after
// it is started, writing its socket to the pointer file as it does.
function world(options: { paneSocket?: string; pointer?: string | null; listening?: string[]; startsAfter?: number; canStart?: boolean }) {
  let clock = 0;
  let pointer = options.pointer ?? null;
  const listening = new Set(options.listening ?? []);
  let startedAt: number | null = null;
  const ports: ReachPorts = {
    paneSocket: options.paneSocket,
    pointed: () => {
      if (startedAt !== null && options.startsAfter !== undefined && clock - startedAt >= options.startsAfter) {
        pointer = '/run/new.sock';
        listening.add(pointer);
      }
      return pointer;
    },
    connects: async (socketPath) => listening.has(socketPath),
    start: options.canStart === false ? null : () => { startedAt = clock; },
    sleep: async (milliseconds) => { clock += milliseconds; },
    now: () => clock,
  };
  return { ports, started: () => startedAt !== null };
}

describe('reachApp', () => {
  it('asks the app that opened the pane while it answers', async () => {
    const { ports, started } = world({ paneSocket: '/run/pane.sock', pointer: '/run/other.sock', listening: ['/run/pane.sock', '/run/other.sock'] });
    expect(await reachApp(ports, true)).toEqual({ ok: true, socket: '/run/pane.sock' });
    expect(started()).toBe(false);
  });

  // A pane outlives its app: the restarted one wrote its socket to the file.
  it('falls back to the socket the file names, outside a pane or when the pane\'s app has quit', async () => {
    const { ports, started } = world({ paneSocket: '/run/gone.sock', pointer: '/run/other.sock', listening: ['/run/other.sock'] });
    expect(await reachApp(ports, true)).toEqual({ ok: true, socket: '/run/other.sock' });
    expect(started()).toBe(false);
  });

  it('starts the app when nothing answers and waits for it to say where it listens', async () => {
    const { ports, started } = world({ pointer: '/run/stale.sock', startsAfter: 2000 });
    expect(await reachApp(ports, true)).toEqual({ ok: true, socket: '/run/new.sock' });
    expect(started()).toBe(true);
  });

  it('gives up at the timeout with a line saying so', async () => {
    const { ports } = world({ startsAfter: 60000 });
    expect(await reachApp(ports, true, 1000)).toEqual({ ok: false, message: launchTimedOut(1000) });
  });

  it('never starts the app for a command that may not, or when it does not know where the app is', async () => {
    const hook = world({ startsAfter: 0 });
    expect(await reachApp(hook.ports, false)).toEqual({ ok: false, message: NOT_RUNNING });
    expect(hook.started()).toBe(false);
    expect(await reachApp(world({ canStart: false }).ports, true)).toEqual({ ok: false, message: NOT_RUNNING });
  });
});

describe('mayStartApp', () => {
  // A worker's hook whose app has quit must not bring a window up.
  it('lets every pane and project command start the app except notify', () => {
    expect(mayStartApp(['claim', '--project', 'crm'])).toBe(true);
    expect(mayStartApp(['project', 'open', '/work/crm', 'crm'])).toBe(true);
    expect(mayStartApp(['notify', '2:3', 'done'])).toBe(false);
  });
});
