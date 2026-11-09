import type { Options, Query, SpawnedProcess } from '@anthropic-ai/claude-agent-sdk';
import { describe, expect, it } from 'vitest';
import { scopedQuery, withScope } from './claude-process';

describe('withScope', () => {
  const options: Options = { cwd: '/work/shop' };

  it("leaves the SDK's own spawn alone when there is no scope", () => {
    expect(withScope(options, undefined)).toBe(options);
    expect(withScope(options, { file: '/sdk/claude', args: [], unit: null })).toBe(options);
  });

  it.skipIf(process.platform === 'win32')('starts the process through the scope, its stdin and stdout piped', async () => {
    // `env --` stands in for systemd-run: it runs what follows its `--`, as the scope does.
    const spawnHook = withScope(options, { file: 'env', args: ['--', 'ignored'], unit: 'agent-test-0000.scope' }).spawnClaudeCodeProcess;
    const child = spawnHook?.({ command: 'cat', args: [], cwd: '/', env: {}, signal: new AbortController().signal }) as SpawnedProcess;
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); });
    const exited = new Promise((resolve) => child.once('exit', resolve));
    child.stdin.end('hello');
    expect(await exited).toBe(0);
    expect(output).toBe('hello');
  });
});

describe('scopedQuery', () => {
  it.skipIf(process.platform === 'win32')("ends a failed session with the scoped CLI's stderr", async () => {
    // Stands in for the SDK: spawns through the hook, then fails the way it does when the CLI exits 1.
    const query = ({ options }: { options: Options }): Query => (async function* () {
      const child = options.spawnClaudeCodeProcess?.({
        command: 'sh', args: ['-c', 'echo "No conversation found" >&2; exit 1'], cwd: '/', env: {}, signal: new AbortController().signal,
      }) as SpawnedProcess;
      await new Promise((resolve) => child.once('exit', resolve));
      yield* [];
      throw new Error('Claude Code process exited with code 1');
    })() as unknown as Query;
    const scope = { file: 'env', args: ['--', 'ignored'], unit: 'agent-test-0000.scope' };
    const running = scopedQuery(query)({ prompt: (async function* () {})(), options: {}, scope });
    await expect((async () => { for await (const message of running) void message; })())
      .rejects.toThrow('Claude Code process exited with code 1. stderr: No conversation found');
  });
});
