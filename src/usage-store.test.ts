import { mkdtemp, mkdir, rm, writeFile, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sweepUsage } from './usage-store';
import { totalsOf, type FileUsage } from './usage';

const NOW = new Date(2026, 8, 14, 9, 0, 0).getTime();
const PROJECT = '/Users/sharp/work/api';

let root = '';

function reply(tokens: number, at: number = NOW, cwd: string = PROJECT): string {
  return `${JSON.stringify({
    type: 'assistant', cwd, timestamp: new Date(at).toISOString(),
    message: { usage: { input_tokens: tokens, output_tokens: 0 } },
  })}\n`;
}

async function sweep(known = new Map<string, FileUsage>()): Promise<Map<string, FileUsage>> {
  return sweepUsage(root, known, NOW);
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'usage-'));
  await mkdir(path.join(root, '-Users-sharp-work-api'), { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function logPath(...parts: string[]): string {
  return path.join(root, '-Users-sharp-work-api', ...parts);
}

describe('sweepUsage', () => {
  it('takes the folder from the log itself, not from the folder name it is stored under', async () => {
    await writeFile(logPath('session-a.jsonl'), reply(10));
    const [file] = [...(await sweep()).values()];
    expect(file.directory).toBe(PROJECT);
    expect(file.allTime).toBe(10);
  });

  it('names a subagent file after the session that spawned it', async () => {
    await mkdir(logPath('session-a', 'subagents'), { recursive: true });
    await writeFile(logPath('session-a', 'subagents', 'agent-1.jsonl'), reply(7));
    const [file] = [...(await sweep()).values()];
    expect(file.session).toBe('session-a');
  });

  it('reads only what has been appended since the last sweep', async () => {
    const file = logPath('session-a.jsonl');
    await writeFile(file, reply(10));
    const known = await sweep();
    await appendFile(file, reply(5));
    await sweep(known);
    expect(totalsOf(known.values(), NOW).allTime).toBe(15);
  });

  it('leaves a half-written line for the next sweep instead of losing it', async () => {
    const file = logPath('session-a.jsonl');
    const whole = reply(10);
    await writeFile(file, `${whole}${whole.slice(0, 40)}`);
    const known = await sweep();
    expect(totalsOf(known.values(), NOW).allTime).toBe(10);
    // The rest of the line arrives; the sweep starts again at the line's own first byte.
    await writeFile(file, `${whole}${whole}`);
    await sweep(known);
    expect(totalsOf(known.values(), NOW).allTime).toBe(20);
  });

  it('counts a shrunken file again rather than keeping what it used to hold', async () => {
    const file = logPath('session-a.jsonl');
    await writeFile(file, reply(10) + reply(10) + reply(10));
    const known = await sweep();
    expect(totalsOf(known.values(), NOW).allTime).toBe(30);
    await writeFile(file, reply(4));
    await sweep(known);
    expect(totalsOf(known.values(), NOW).allTime).toBe(4);
  });

  it('forgets a log that has been deleted', async () => {
    const file = logPath('session-a.jsonl');
    await writeFile(file, reply(10));
    const known = await sweep();
    await rm(file);
    await sweep(known);
    expect(totalsOf(known.values(), NOW).allTime).toBe(0);
  });

  it('skips a damaged line and keeps counting the rest', async () => {
    await writeFile(logPath('session-a.jsonl'), `${reply(10)}{"usage":\n${reply(5)}`);
    expect(totalsOf((await sweep()).values(), NOW).allTime).toBe(15);
  });

  it('drops samples that have fallen out of both windows but keeps them in all time', async () => {
    const lastMonth = NOW - 30 * 24 * 60 * 60 * 1000;
    await writeFile(logPath('session-a.jsonl'), reply(99, lastMonth));
    const [file] = [...(await sweep()).values()];
    expect(file.samples).toEqual([]);
    expect(file.allTime).toBe(99);
  });

  it('answers with nothing when there are no logs on the machine at all', async () => {
    expect([...(await sweepUsage(path.join(root, 'absent'), new Map(), NOW)).values()]).toEqual([]);
  });
});
