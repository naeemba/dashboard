import type { Options, SpawnedProcess } from '@anthropic-ai/claude-agent-sdk';
import { describe, expect, it } from 'vitest';
import { claudeInScope, withScope } from './claude-process';

const SCOPE = {
  file: 'systemd-run',
  args: ['--user', '--scope', '--slice=agents.slice', '--unit=agent-main-shop-k4f2.scope', '--', '/sdk/claude'],
  unit: 'agent-main-shop-k4f2.scope',
};

describe('claudeInScope', () => {
  it("runs the SDK's own command and flags after systemd-run's options", () => {
    expect(claudeInScope(SCOPE, { command: '/sdk/claude', args: ['--output-format', 'stream-json'] })).toEqual({
      file: 'systemd-run',
      args: ['--user', '--scope', '--slice=agents.slice', '--unit=agent-main-shop-k4f2.scope', '--', '/sdk/claude', '--output-format', 'stream-json'],
    });
  });

  it('takes the command the SDK chose over the executable it was given, as node and a script', () => {
    expect(claudeInScope(SCOPE, { command: 'node', args: ['/sdk/cli.js', '--verbose'] }).args.slice(-4))
      .toEqual(['--', 'node', '/sdk/cli.js', '--verbose']);
  });
});

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
