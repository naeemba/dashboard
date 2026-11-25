import { isManagerHomeDirectory, openBoard, peekBoard, projectRoot, putBackSeededDocs, readBoard, seededDocsNow, writeBoard } from './board-store';
import { failureLine } from '../command/failure-line';
import { projectNamedInFile } from '../projects/project-named';
import { asksApp, BOARD_REQUEST, brokenFilesRefusal, finishedByMove, readsBoard, runBoardCommand, runBoardCommandOnLatest, withWholeId, type CommandResult } from './board-cli';
import { syncBoard, type BoardSync } from './board-sync-git';
import { notSyncedRefusal, notSyncedWarning } from './board-sync';
import { rebaseBoardChange } from '../../shared/board/board-merge';
import { failureText } from '../../shared/errors/failure';
import type { Board } from '../../shared/board/board';
import { askLanded, askRunningApp } from '../workers/session-socket';
import { landedLine } from '../workers/session-cli';
import { boardTarget } from './board-target';
import { isLinkedWorktree } from './linked-worktree';
import { holdsWorktree } from '../workers/run-folder';
import { boardGuard } from './board-guard';
import { runningAppGuard, runningProcess, type RunningProcess } from '../workflow/running-app-guard';
import { packageManagerGuard } from '../workflow/package-manager-guard';
import { testRunGuard, type TestRunMachine } from '../workflow/test-run-guard';
import { worktreeGuard, type WorktreeList } from '../workflow/worktree-guard';
import { gitNow } from '../app/git';
import { parseEveryWorktree } from '../../shared/ship/git-worktrees';
import { existsSync, readdirSync, readFileSync, readlinkSync } from 'node:fs';

// The whole of the `board` program outside board-cli.ts: the current directory and the words in, a
// file and a line of output out, and the exit code back. Every decision it could make is made there
// instead, where a test can reach it. Two doors run it: board-cli-entry.ts, the file DASHBOARD_BOARD
// names, and `dashboard board`.
//
// The current directory points it, or --project and a name from ~/.dashboard/projects.yaml; which one
// is board-target.ts's to say. projectRoot is what makes any depth inside the project work, so an
// agent that has stepped into src/ still edits the project's one board.
async function run(words: readonly string[]): Promise<number> {
  const target = boardTarget(words, process.cwd(), { isHome: isManagerHomeDirectory, projectRoot, named: projectNamedInFile });
  if (!target.ok) {
    process.stderr.write(`${target.message}\n`);
    return 1;
  }
  const { project, commandArguments } = target;
  // A ship, a review and a move into Ship or Review are the app's to do, so the screen, the command
  // and the sweep all mean the same thing by one; docs/actions/README.md says why. The app is started
  // when none answers. asksApp says which; on a worktree's board a move is only a move.
  // A prefix of a card's id is made whole first, against this folder's board, since the app takes a
  // whole id only.
  if (asksApp(commandArguments, !isLinkedWorktree(project))) {
    const whole = withWholeId(peekBoard(project), commandArguments);
    if ('message' in whole) return answer({ ok: false, message: whole.message });
    const [verb, ...rest] = whole.commandArguments;
    return askRunningApp([BOARD_REQUEST, verb, project, ...rest]);
  }
  // Without salvage: a file that does not parse stays where it is under its own name, so every run
  // refuses until it is fixed. readBoard says why a rename here would commit the card as deleted.
  const docsBefore = seededDocsNow(project);
  const read = openBoard(project, false);
  if (read.brokenFiles.length > 0) {
    process.stderr.write(`${brokenFilesRefusal(read.brokenFiles)}\n`);
    return 1;
  }

  // A board git tracks is read and written on origin's default branch, and this checkout brought up to
  // it (board-sync-git.ts). The id is made once, so an `add` retried on a fresh fetch is one card. A
  // sync that throws is one more way of not reaching origin: the board is written here, with the
  // warning, or refused in a worktree (notSyncedRefusal).
  const id = crypto.randomUUID();
  const makeId = () => id;
  let notSynced: string | null = null;
  if (readsBoard(commandArguments)) {
    // Each board the command ran on and what it answered; the last is what went up, when a lost race retried.
    const tries: { before: Board; result: CommandResult }[] = [];
    const sync = await syncBoard(project, (board) => {
      const result = runBoardCommand(board, commandArguments, makeId);
      tries.push({ before: board, result });
      return result.ok && result.board !== null ? result.board : board;
    }).catch((error: unknown): BoardSync => ({ synced: false, reason: failureText(error) }));
    const onOrigin = tries.at(-1);
    if (sync.synced && onOrigin !== undefined) {
      const { before, result } = onOrigin;
      // A checkout the sync could not move holds the edit as well, as it did before there was a sync:
      // the same change, not the command run again, whose new timestamps the next sync would publish as
      // a second comment.
      if (sync.checkout === 'stale' && result.ok && result.board !== null) {
        writeBoard(project, rebaseBoardChange(before, result.board, readBoard(project, false).board));
      }
      return answer(await withLanded(project, commandArguments, result));
    }
    if (!sync.synced) notSynced = sync.reason;
  } else if (read.reseeded) {
    // The usage alone changes no card, but the read above rewrote the explanation files, and only a
    // sync commits that rewrite and leaves the checkout clean (board-decision-8). One that fails is
    // handled in writeHere as a card change's is.
    const sync = await syncBoard(project).catch((error: unknown): BoardSync => ({ synced: false, reason: failureText(error) }));
    if (!sync.synced) notSynced = sync.reason;
  }
  return answer(await withLanded(project, commandArguments, writeHere(project, read.board, commandArguments, makeId, notSynced, read.reseeded ? docsBefore : null)));
}

// A move into Done or Cancelled, once written, releases the card's worker pane through the app, and
// says so after the move's own line (workers-decision-1).
async function withLanded(project: string, commandArguments: readonly string[], result: CommandResult): Promise<CommandResult> {
  const card = finishedByMove(commandArguments, result);
  if (card === null || !result.ok) return result;
  const line = await askLanded('card', card, project)
    .then(landedLine, (error: unknown) => `no worker released: ${failureLine(error)}`);
  return line === '' ? result : { ...result, output: `${result.output}\n${line}` };
}

// The command run on this folder's board and written here. Against the board as it stands a moment
// before the write, not the one opened: runBoardCommandOnLatest says why. Written before the line is
// printed, so a failed write is what you see rather than a success message about a change that is not
// on disk. `notSynced` is why origin could not take it, when that was tried and failed. `docsBefore`
// is the seeded docs before the read rewrote them, when it did.
function writeHere(project: string, opened: Board, commandArguments: readonly string[], makeId: () => string, notSynced: string | null, docsBefore: Record<string, string | null> | null): CommandResult {
  const result = runBoardCommandOnLatest(opened, commandArguments, () => readBoard(project, false).board, makeId);
  const changes = result.ok && result.board !== null;
  if (notSynced !== null) {
    // Any linked worktree, not only the app's (isLinkedWorktree): every one holds its branch's board.
    const inWorktree = holdsWorktree(project);
    // A doc the read rewrote rides the branch as a card file would (notSyncedRefusal), so a worktree
    // gets it back as it was. The read or usage is still answered: only the rewrite is not kept.
    if (docsBefore !== null && notSyncedRefusal(inWorktree, true, notSynced) !== null) putBackSeededDocs(project, docsBefore);
    const refusal = notSyncedRefusal(inWorktree, changes, notSynced);
    if (refusal !== null) return { ok: false, message: refusal };
    process.stderr.write(`${notSyncedWarning(notSynced)}\n`);
  }
  if (result.ok && result.board !== null) writeBoard(project, result.board);
  return result;
}

function answer(result: CommandResult): number {
  if (!result.ok) {
    process.stderr.write(`${result.message}\n`);
    return 1;
  }
  process.stdout.write(`${result.output}\n`);
  return 0;
}

// `board guard`, a PreToolUse hook: the board guard (board-guard.ts), the running-app guard
// (running-app-guard.ts), the package-manager guard (package-manager-guard.ts), which reads the
// lockfiles of the session's folder, the hook input's `cwd`, the test-run guard (test-run-guard.ts),
// then the worktree guard (worktree-guard.ts). The hook's input in, the refusal to print or ''. The
// board's refusal names the command the way the caller can run it, `$DASHBOARD_BOARD` in a pane the
// app opened (`boardVariable` set) and this program's own path outside one. `startFolder` is the
// session's (`CLAUDE_PROJECT_DIR`), the hook's `cwd` when unset.
// What the guards read of the machine, passed in so a test can stand in for it.
export type GuardMachine = TestRunMachine & { listWorktrees: WorktreeList };

export function guardAnswer(inputText: string, boardVariable: string | undefined, programPath: string, machine: GuardMachine, startFolder: string | undefined): string {
  const input = JSON.parse(inputText) as { tool_name?: unknown; tool_input?: unknown; cwd?: unknown };
  const toolName = String(input.tool_name);
  const command = boardVariable === undefined ? programPath : '$DASHBOARD_BOARD';
  const folder = typeof input.cwd === 'string' ? input.cwd : undefined;
  const refused = boardGuard(toolName, input.tool_input, command)
    ?? runningAppGuard(toolName, input.tool_input, machine.listProcesses)
    ?? packageManagerGuard(toolName, input.tool_input, folder, machine.exists)
    ?? testRunGuard(toolName, input.tool_input, folder, machine)
    ?? worktreeGuard(toolName, input.tool_input, folder ?? '', machine.listWorktrees, startFolder);
  return refused === undefined ? '' : JSON.stringify(refused);
}

// Every process /proc shows, or null where there is no /proc (a mac). Read only when a command could
// kill something or runs tests, and a process that ends while it is read is left out.
// ponytail: a mac has no /proc, so there a kill is judged by the names it carries.
function procProcesses(): RunningProcess[] | null {
  let pids: string[];
  try {
    pids = readdirSync('/proc').filter((name) => /^\d+$/.test(name));
  } catch {
    return null;
  }
  return pids.flatMap((pid) => {
    try {
      const argv = readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean);
      return [runningProcess(Number(pid), readFileSync(`/proc/${pid}/comm`, 'utf8').trim(), argv)];
    } catch {
      return [];
    }
  });
}

// The folder a process works in, or null where /proc hides it (another user's process).
function workingFolder(pid: number): string | null {
  try {
    return readlinkSync(`/proc/${pid}/cwd`);
  } catch {
    return null;
  }
}

// Every worktree of the repository `folder` is in, as git lists them, or null outside one.
function gitWorktrees(folder: string): string[] | null {
  try {
    return parseEveryWorktree(gitNow(['worktree', 'list', '--porcelain'], folder), folder).map((worktree) => worktree.worktreePath);
  } catch {
    return null;
  }
}

function guard(): number {
  const machine = { listProcesses: procProcesses, workingFolder, exists: existsSync, listWorktrees: gitWorktrees };
  process.stdout.write(guardAnswer(readFileSync(0, 'utf8'), process.env.DASHBOARD_BOARD, process.argv[1], machine, process.env.CLAUDE_PROJECT_DIR));
  return 0;
}

// One door out for every failure: a line on stderr and exit 1, the same shape a refused command
// already uses. The reads and the write are the paths that throw — a board that cannot be read, a
// board that cannot be replaced — and without this those two are the only ones that answer an agent
// with a node stack trace instead of a sentence. What the line says is failureLine's decision, in
// command/failure-line.ts, shared by every program the dashboard command runs.
export async function runBoardProgram(commandArguments: readonly string[]): Promise<number> {
  try {
    if (commandArguments[0] === 'guard') return guard();
    return await run(commandArguments);
  } catch (error: unknown) {
    process.stderr.write(`${failureLine(error)}\n`);
    return 1;
  }
}
