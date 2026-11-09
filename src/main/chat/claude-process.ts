import type { Options, Query, SpawnedProcess } from '@anthropic-ai/claude-agent-sdk';
import { unpacked } from '../app/unpacked';
import { spawnScoped } from '../processes/spawn-scoped';
import { retargeted, type ScopedCommand } from '../processes/scope';
import type { HostedParams } from '../workers/screen-host-protocol';

// The Claude process the Agent SDK starts for a session: which binary, and the systemd scope it runs
// in. Both of main's ways to start one go through scopedQuery — a page's main and a worker screen run
// in the app, and a worker screen in the screen host — so every SDK session lands in the scope main
// chose for it (processes-decision-5).

// The CLI the SDK drives, from the platform package pnpm installed beside it. Named here rather than
// left to the SDK because a packaged app keeps it in app.asar.unpacked: nothing can be executed from
// inside an asar, and the SDK would find the copy inside it. On a musl Linux pnpm installs the `-musl`
// package instead, so that name is tried when the plain one is not there.
export function claudeExecutable(): string {
  const binary = process.platform === 'win32' ? 'claude.exe' : 'claude';
  const name = `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}`;
  let found: string;
  try {
    found = require.resolve(`${name}/${binary}`);
  } catch (error) {
    if (process.platform !== 'linux') throw error;
    found = require.resolve(`${name}-musl/${binary}`);
  }
  return unpacked(found);
}

// The last of a scoped CLI's stderr, which the SDK keeps only for a process it spawned itself. Kept to
// the same couple of thousand characters, so a chatty CLI cannot grow it.
const STDERR_LIMIT = 2000;
type StderrTail = { text: string; closed: Promise<void> };

// The session's options with the SDK's spawn routed through the scope: the SDK's command as it chose
// it (the CLI itself, or node and the CLI's script) and every flag it built. With no scope (unavailable,
// not Linux, a caller from before scopes) the options are left alone and the SDK spawns as it always
// did. stderr is drained into `tail` as it comes, so a full pipe never stalls the CLI.
export function withScope(options: Options, scope: ScopedCommand | undefined, tail?: StderrTail): Options {
  if (scope?.unit == null) return options;
  return {
    ...options,
    spawnClaudeCodeProcess: (started) => {
      const child = spawnScoped(retargeted(scope, started.command, started.args), {
        cwd: started.cwd, env: started.env, signal: started.signal, stdio: ['pipe', 'pipe', 'pipe'],
      });
      if (tail) tail.closed = new Promise((resolve) => child.stderr?.once('close', resolve));
      child.stderr?.on('data', (chunk: Buffer) => {
        if (tail) tail.text = (tail.text + chunk.toString()).slice(-STDERR_LIMIT);
      });
      return child as SpawnedProcess;
    },
  };
}

// How long a failure waits for the CLI's stderr to close, which follows its exit by moments. An error
// thrown while the CLI still runs (an abort) gives up waiting and goes as it was.
const STDERR_WAIT_MS = 500;

// The query, its failure carrying the scoped CLI's last stderr lines the way the SDK's own spawn adds
// them (`exited with code 1. stderr: No conversation found ...`): a resume of a deleted conversation,
// an expired login or systemd-run's own refusal then says why on the screen.
function explained(running: Query, tail: StderrTail): Query {
  const next: Query['next'] = (...args) => running.next(...args).catch(async (error: unknown) => {
    await Promise.race([tail.closed, new Promise((resolve) => setTimeout(resolve, STDERR_WAIT_MS))]);
    const said = tail.text.trim();
    if (said !== '' && error instanceof Error) error.message += `. stderr: ${said}`;
    throw error;
  });
  const wrapped: Query = new Proxy(running, {
    get(target, key) {
      if (key === 'next') return next;
      if (key === Symbol.asyncIterator) return () => wrapped;
      const value: unknown = Reflect.get(target, key, target);
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  });
  return wrapped;
}

export function scopedQuery(query: (params: { prompt: HostedParams['prompt']; options: Options }) => Query) {
  return ({ prompt, options, scope }: HostedParams): Query => {
    const tail: StderrTail = { text: '', closed: Promise.resolve() };
    return explained(query({ prompt, options: withScope(options, scope, tail) }), tail);
  };
}
