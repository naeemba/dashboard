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

// The session's options with the SDK's spawn routed through the scope: the SDK's command as it chose
// it (the CLI itself, or node and the CLI's script) and every flag it built. With no scope (unavailable,
// not Linux, a caller from before scopes) the options are left alone and the SDK spawns as it always
// did. stderr is dropped rather than piped: nothing reads it, and a full pipe would stall the CLI.
export function withScope(options: Options, scope: ScopedCommand | undefined): Options {
  if (scope?.unit == null) return options;
  return {
    ...options,
    spawnClaudeCodeProcess: (started) => spawnScoped(retargeted(scope, started.command, started.args), {
      cwd: started.cwd, env: started.env, signal: started.signal, stdio: ['pipe', 'pipe', 'ignore'],
    }) as SpawnedProcess,
  };
}

export function scopedQuery(query: (params: { prompt: HostedParams['prompt']; options: Options }) => Query) {
  return ({ prompt, options, scope }: HostedParams): Query => query({ prompt, options: withScope(options, scope) });
}
