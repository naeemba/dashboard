import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { runProgram } from '../app/git';
import { baseBranch } from '../app/base-branch';
import { BOARD_PATHSPECS } from '../board/board-store';
import { FETCH_TIMEOUT } from '../board/board-sync';
import { WORK_STATUS, changedFiles, isBoardPath, pastRemotes } from './ship';

// Whether the board files a worktree holds, uncommitted or in a commit no remote has, already
// reached origin's default branch. workChanges and unpushedWork let those files go as a stale copy
// of origin's board (ship-decision-7); this is what a sweep asks before it does, so a board write
// whose sync to origin failed is not lost with its worktree.
//
// Reached means origin's default branch holds, or once held, the worktree's version of each file:
// at its tip or anywhere in its history, after a fetch. Once held, not only at its tip: a card's file
// in a worktree is the Review its agent wrote, and origin has moved the card to Done since. A file
// the worktree deleted reached origin when origin's tip has no such file.
//
// `committedToo` false asks only the uncommitted files: the list's forced removal keeps the branch, so
// a committed one is not lost with the folder.
//
// Null when every one did, otherwise the reason the folder stays, written to follow "kept <folder>:".
// A fetch or git that fails keeps it too: silence is not "already there".
type RunProgram = typeof runProgram;

const version = (path: string, blob: string) => `${path}\0${blob}`;

// `git log --raw` lines (`:100644 100644 <old> <new> M\t<path>`) as the versions they wrote.
function written(rawLog: string): Set<string> {
  return new Set(rawLog.split('\n').filter((line) => line.startsWith(':')).map((line) => {
    const [fields, path] = line.split('\t');
    return version(path, fields.split(' ')[3]);
  }));
}

// The board files the worktree changed past the remotes (and past `mergedAt`, the commit its pull
// request merged at), committed or not; only the uncommitted ones when `committedToo` is false.
async function boardFilesChanged(run: RunProgram, worktreePath: string, mergedAt: string | undefined, committedToo: boolean): Promise<string[]> {
  const [status, committed] = await Promise.all([
    run('git', [...WORK_STATUS], worktreePath),
    committedToo
      ? run('git', ['log', '--format=', '--name-only', '--no-renames', ...pastRemotes(mergedAt), '--', ...BOARD_PATHSPECS], worktreePath)
      : '',
  ]);
  const uncommitted = changedFiles(status).filter(isBoardPath);
  return [...new Set([...uncommitted, ...committed.split('\n').filter((path) => path !== '')])];
}

export async function boardNotOnOrigin(run: RunProgram, worktreePath: string, mergedAt?: string, committedToo = true): Promise<string | null> {
  try {
    const paths = await boardFilesChanged(run, worktreePath, mergedAt, committedToo);
    if (paths.length === 0) return null;
    const { remote, branch } = await baseBranch(worktreePath, run);
    const origin = `${remote}/${branch}`;
    // ponytail: one fetch per worktree with board edits; fetch once per project per sweep if many pile up.
    const fetched = await run('git', ['fetch', '--quiet', remote, branch], worktreePath, { timeout: FETCH_TIMEOUT }).then(() => true, () => false);
    if (!fetched) return `its board edits could not be checked: fetching ${origin} failed`;
    const [history, tip] = await Promise.all([
      run('git', ['log', '-m', '--format=', '--raw', '--no-abbrev', '--no-renames', origin, '--', ...paths], worktreePath),
      run('git', ['ls-tree', '--name-only', origin, '--', ...paths], worktreePath),
    ]);
    const held = written(history);
    const atTip = new Set(tip.split('\n'));
    const present = paths.filter((path) => existsSync(join(worktreePath, path)));
    const blobs = present.length === 0 ? [] : (await run('git', ['hash-object', '--', ...present], worktreePath)).split('\n');
    const missing = [
      ...present.filter((path, index) => !held.has(version(path, blobs[index]))),
      ...paths.filter((path) => !present.includes(path) && atTip.has(path)),
    ];
    return missing.length === 0 ? null : `its board edits of ${missing.join(', ')} never reached ${origin}`;
  } catch {
    return 'its board edits could not be checked against origin';
  }
}
