import { open, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { retainFrom, tokensOf, type FileUsage } from './usage';

// Reading Claude Code's session logs. Every rule about what a number means is usage.ts's; what is here
// is the walk, the incremental read, and the one decision that belongs with the file rather than the
// arithmetic: how much of a file has been counted.
//
// The logs are ~/.claude/projects/<folder>/<session>.jsonl, with a subagent's own file one or two
// folders deeper under the session it was spawned from. Half a gigabyte of them reads in about two
// seconds, so the first sweep can simply read the lot; every sweep after it reads only what has been
// appended, which is nothing at all for all but the handful of sessions running right now.

const LOG_SUFFIX = '.jsonl';

// Only lines carrying a usage block are worth parsing, and they are a quarter of the file. The test
// is on the raw text because JSON.parse on the other three quarters is most of the cost of a sweep.
const USAGE_MARKER = '"usage"';

type LogLine = {
  cwd?: string;
  timestamp?: string;
  message?: { usage?: Record<string, number> };
};

// Every .jsonl under the root, with the session each belongs to. The session is the first thing under
// the project's folder: `<project>/<session>.jsonl` for the session itself, and
// `<project>/<session>/subagents/...jsonl` for an agent it spawned. Naming both after the session is
// what puts an agent's cost on the pane that started it.
async function logFiles(root: string): Promise<{ file: string; session: string }[]> {
  const found: { file: string; session: string }[] = [];
  let projects: string[];
  try {
    projects = await readdir(root);
  } catch {
    // No logs on this machine, or no permission to look. The numbers stay at nought and nothing says
    // so, which is the right amount of noise for a machine that has never run Claude Code.
    return found;
  }
  for (const project of projects) {
    await walk(path.join(root, project), null, found);
  }
  return found;
}

async function walk(
  directory: string,
  session: string | null,
  found: { file: string; session: string }[],
): Promise<void> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(full, session ?? entry.name, found);
      continue;
    }
    if (!entry.name.endsWith(LOG_SUFFIX)) continue;
    found.push({ file: full, session: session ?? entry.name.slice(0, -LOG_SUFFIX.length) });
  }
}

// What one file has added since it was last read. `size` only moves past a line that arrived whole:
// a sweep landing between an agent writing half a line and the rest of it would otherwise start the
// next sweep inside that line, and the tokens on it would be lost with nothing failing.
//
// The size is passed in rather than read here, because the caller has already asked for it: four
// thousand logs are opened by a sweep that has nothing to read, and opening them all costs three
// times what stating them does.
async function readAppended(file: string, from: number, size: number): Promise<{ text: string; size: number } | null> {
  const handle = await open(file, 'r');
  try {
    // A file that has shrunk is not the file we were reading — a session cleared, a log rotated — so
    // it is counted again from the start rather than read from an offset inside it.
    const start = size < from ? 0 : from;
    const buffer = Buffer.allocUnsafe(size - start);
    // Only the bytes that were actually read. `allocUnsafe` hands back whatever was in that heap
    // memory, and a short read — the file cleared between the stat and here — would otherwise have the
    // tail of it decoded as content: one stale `\n` in there and `size` moves past lines nobody
    // counted, whose tokens are then gone for the life of the app.
    const { bytesRead } = await handle.read(buffer, 0, size - start, start);
    const text = buffer.subarray(0, bytesRead).toString('utf8');
    const lastBreak = text.lastIndexOf('\n');
    // Nothing whole yet. Left for the next sweep, which reads the same bytes again with the rest of
    // the line behind them.
    if (lastBreak === -1) return null;
    return { text: text.slice(0, lastBreak), size: start + Buffer.byteLength(text.slice(0, lastBreak + 1)) };
  } finally {
    await handle.close();
  }
}

// One file's new lines, added to what it had already contributed. A file that has never named a
// folder keeps an empty one and is counted towards no project: ranInProject refuses it, which is the
// same answer without a second way of saying it.
function countInto(usage: FileUsage, text: string): void {
  for (const line of text.split('\n')) {
    if (!line.includes(USAGE_MARKER)) continue;
    let parsed: LogLine;
    try {
      parsed = JSON.parse(line) as LogLine;
    } catch {
      // Real logs have these: a line cut short by a crash, or bytes from two writes interleaved. One
      // reply's tokens go missing out of tens of thousands, which is quieter than a sweep that stops.
      continue;
    }
    const block = parsed.message?.usage;
    if (block === undefined) continue;
    const at = Date.parse(parsed.timestamp ?? '');
    if (Number.isNaN(at)) continue;
    if (parsed.cwd !== undefined) usage.directory = parsed.cwd;
    const tokens = tokensOf(block);
    usage.allTime += tokens;
    usage.samples.push({ at, tokens });
  }
}

// One pass over the logs, folded into what the last pass found. `known` is kept across sweeps and
// edited in place: that is what makes every sweep after the first one cheap, since a file whose size
// has not moved is not opened at all.
// ponytail: stats every log every sweep — about a hundred milliseconds for four thousand files, on
// the thread every pane's bytes flow through. If that starts showing, narrow the walk to the folders
// of the projects that are open rather than reading faster.
export async function sweepUsage(
  root: string,
  known: Map<string, FileUsage>,
  now: number,
): Promise<Map<string, FileUsage>> {
  const files = await logFiles(root);
  const seen = new Set<string>();
  const cutoff = retainFrom(now);
  for (const { file, session } of files) {
    seen.add(file);
    const usage = known.get(file) ?? { size: 0, directory: '', session, allTime: 0, samples: [] };
    try {
      // Stat first, and open nothing at all for a log that has not moved — which is every log but the
      // handful being written to right now. This is the whole of what makes a sweep cheap: without it
      // a quarter of a second goes on opening four thousand files to find that none of them has
      // anything new in it, every half minute, on the thread every pane's bytes flow through.
      const { size } = await stat(file);
      const appended = size === usage.size ? null : await readAppended(file, usage.size, size);
      if (appended !== null) {
        // A file read from the start again has to forget what it contributed before, or its whole
        // history is counted twice.
        if (appended.size < usage.size) {
          usage.allTime = 0;
          usage.samples = [];
        }
        countInto(usage, appended.text);
        usage.size = appended.size;
      }
    } catch {
      // Deleted between the walk and the read, or unreadable. Left as it was; the next sweep either
      // finds it again or drops it below.
    }
    // Pruned whether or not the file moved: yesterday's samples fall out of the windows on their own
    // as the day goes on, and a file nobody has written to since is where most of them are.
    usage.samples = usage.samples.filter((sample) => sample.at >= cutoff);
    known.set(file, usage);
  }
  // A log deleted takes its tokens with it, rather than being counted forever by a map that only ever
  // grows.
  for (const file of known.keys()) if (!seen.has(file)) known.delete(file);
  return known;
}

// The sessions Claude Code has running right now. It writes one small file per process, named after
// the process's pid, and leaves it behind when the process dies — so this says "has run", not "is
// running". Nothing here checks: a stale pid is not in the process tree, and the walk in
// pane-sessions.ts finds no pane for it and drops it.
export async function liveSessions(directory: string): Promise<{ pid: number; session: string }[]> {
  let names: string[];
  try {
    names = await readdir(directory);
  } catch {
    return [];
  }
  const sessions: { pid: number; session: string }[] = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    try {
      const record = JSON.parse(await readFile(path.join(directory, name), 'utf8')) as {
        pid?: unknown; sessionId?: unknown;
      };
      if (typeof record.pid !== 'number' || typeof record.sessionId !== 'string') continue;
      sessions.push({ pid: record.pid, session: record.sessionId });
    } catch {
      // Half-written, or a file of Claude Code's we do not know the shape of. One pane's figure goes
      // missing rather than the sweep.
    }
  }
  return sessions;
}
