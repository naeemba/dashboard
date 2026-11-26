import { appendFile, mkdir, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { countsSchedule, loadCounts, saveCounts, SAVE_EVERY_MS } from './usage-counts';
import { sweepUsage } from './usage-store';
import { totalsOf, type FileUsage } from '../../shared/usage/usage';
import { temporaryFolder } from '../testing/temporary-folder';

const NOW = new Date(2026, 8, 14, 9, 0, 0).getTime();

function reply(tokens: number, at: number = NOW): string {
  return `${JSON.stringify({
    cwd: '/work/api', timestamp: new Date(at).toISOString(), message: { usage: { input_tokens: tokens } },
  })}\n`;
}

describe('saved counts', () => {
  // The card's own bar: a launch that starts from saved counts adds up to what reading every log does.
  it('give a launch the same totals as reading every log again', async () => {
    const folder = temporaryFolder('usage-counts-');
    const root = path.join(folder, 'projects');
    const project = path.join(root, '-work-api');
    await mkdir(path.join(project, 'b', 'subagents'), { recursive: true });
    const log = (name: string) => path.join(project, name);
    await writeFile(log('a.jsonl'), reply(10) + reply(20, NOW - 2 * 60 * 60 * 1000));
    await writeFile(log('b.jsonl'), reply(5));
    await writeFile(log('b/subagents/agent.jsonl'), reply(7));
    await writeFile(log('rewritten.jsonl'), reply(30) + reply(30));
    await writeFile(log('half.jsonl'), reply(3) + reply(4).slice(0, 20));
    const counts = path.join(folder, 'usage-counts.json');
    saveCounts(counts, await sweepUsage(root, new Map(), NOW));

    // Between the two runs: one log appended to, one rewritten to the same length, one new, one the
    // rest of its last line, one deleted.
    await appendFile(log('a.jsonl'), reply(1));
    await writeFile(log('rewritten.jsonl'), reply(40) + reply(20));
    await utimes(log('rewritten.jsonl'), new Date(), new Date(Date.now() + 5_000));
    await writeFile(log('new.jsonl'), reply(9));
    await writeFile(log('half.jsonl'), reply(3) + reply(4));
    await writeFile(log('b.jsonl'), '');

    const launched = await sweepUsage(root, new Map(), NOW, loadCounts(counts));
    const everything = await sweepUsage(root, new Map(), NOW);
    expect(totalsOf(launched.values(), NOW)).toEqual(totalsOf(everything.values(), NOW));
    expect(totalsOf(launched.values(), NOW).allTime).toBe(10 + 20 + 1 + 7 + 40 + 20 + 9 + 3 + 4);
  });

  it('take a saved count only for a log whose mtime has not moved', async () => {
    const root = temporaryFolder('usage-counts-');
    await mkdir(path.join(root, 'p'));
    const file = path.join(root, 'p', 's.jsonl');
    await writeFile(file, reply(10));
    const known = await sweepUsage(root, new Map(), NOW);
    // A count the logs do not say, so the test can tell a taken count from a read one.
    const saved = new Map<string, FileUsage>([[file, { ...known.get(file)!, allTime: 999 }]]);
    expect(totalsOf((await sweepUsage(root, new Map(), NOW, saved)).values(), NOW).allTime).toBe(999);
    await utimes(file, new Date(), new Date(Date.now() + 5_000));
    expect(totalsOf((await sweepUsage(root, new Map(), NOW, saved)).values(), NOW).allTime).toBe(10);
  });

  // A log emptied while the app runs has no whole line to read; its old count must still go, or it is
  // saved and taken back on every launch after.
  it('forget a log emptied between two sweeps, in the running app and on the next launch', async () => {
    const folder = temporaryFolder('usage-counts-');
    const root = path.join(folder, 'projects');
    await mkdir(path.join(root, 'p'), { recursive: true });
    const file = path.join(root, 'p', 's.jsonl');
    await writeFile(file, reply(50));
    const known = await sweepUsage(root, new Map(), NOW);
    await writeFile(file, reply(4).slice(0, 20));
    expect(totalsOf((await sweepUsage(root, known, NOW)).values(), NOW).allTime).toBe(0);
    const counts = path.join(folder, 'usage-counts.json');
    saveCounts(counts, known);
    expect(totalsOf((await sweepUsage(root, new Map(), NOW, loadCounts(counts))).values(), NOW).allTime).toBe(0);
  });

  it('load for the first sweep that succeeds, and save then and every SAVE_EVERY_MS after', () => {
    const schedule = countsSchedule();
    expect(schedule.toLoad()).toBe(true);
    // A first sweep that threw never reached swept(), so the next one still loads.
    expect(schedule.toLoad()).toBe(true);
    schedule.swept();
    expect(schedule.toLoad()).toBe(false);
    expect(schedule.dueToSave(NOW)).toBe(true);
    // Due once: a save that then failed is not asked for again on the next sweep.
    expect(schedule.dueToSave(NOW + 30_000)).toBe(false);
    expect(schedule.dueToSave(NOW + SAVE_EVERY_MS)).toBe(true);
  });

  it('are nothing when the file is missing, damaged or from another version', async () => {
    const folder = temporaryFolder('usage-counts-');
    const file = path.join(folder, 'usage-counts.json');
    expect(loadCounts(file).size).toBe(0);
    const entry: [string, FileUsage] = ['/a.jsonl', { size: 1, directory: '', session: 'a', allTime: 1, samples: [] }];
    saveCounts(file, new Map([entry]));
    expect(loadCounts(file).size).toBe(1);
    await writeFile(file, '{"version": 1, "files": [["/a.js');
    expect(loadCounts(file).size).toBe(0);
    await writeFile(file, JSON.stringify({ version: 0, files: [entry] }));
    expect(loadCounts(file).size).toBe(0);
  });
});
