import { existsSync } from 'node:fs';
import { baseName } from '../../shared/app/base-name';
import { failureText } from '../../shared/errors/failure';
import type { PaneCommand } from '../../shared/panes/pane-reading';
import { git } from '../app/git';
import { changedFiles } from './ship';
import { forgetSize } from './worktree-scan';
import {
  entryForPath,
  livingEntries,
  stillLiving,
  withoutWorktree,
  worktreesDiffer,
  writeWorktrees,
} from './worktree-store';
import type { WorktreeEntry, WorktreeList, WorktreeRemoval } from '../../shared/app/bridge';

// What the keeper needs from main: the record file and what was read from it at launch, the panes and
// the shells running in them, and the way to tell every screen the list changed.
type WorktreeKeeperPorts = {
  file: string;
  entries: WorktreeEntry[];
  commands: Map<string, PaneCommand>;
  shells: ReadonlyMap<string, { kill(): void }>;
  announce: (list: WorktreeList) => void;
};

// The worktree record after launch, and every change to it. main.ts holds the launch read, because a
// record it cannot read stops the app with a dialog only main can show.
export function worktreeKeeper({ file, entries: recordAtLaunch, commands, shells, announce }: WorktreeKeeperPorts) {
  let entries = recordAtLaunch;
  // The worktrees a removal is part way through. `git worktree remove` is awaited, and git unlinks the
  // folder before it answers, so without this the sweep lands in that gap, calls the record dead and
  // hands its pane back to the project — and the kill that follows the removal then finds no pane in the
  // worktree and leaves the agent running in a folder git has just deleted, writing errors into a pane
  // the app counts as free. Held for the length of the one removal, the way ship-flow.ts holds a ship.
  const removing = new Set<string>();

  // The other half of releaseAgentPane in main.ts, for a pane whose worktree has gone rather than whose
  // agent has: it goes back to a plain shell in the project, since the folder it was in is not there
  // any more. That is also what puts the pane back at the front of the queue a ship picks from —
  // freePane holds why a pane standing in a worktree is taken last, and this one is not standing in it
  // any more.
  function releasePanes(entry: WorktreeEntry): void {
    for (const [id, command] of commands) {
      if (command.directory !== entry.worktreePath) continue;
      commands.set(id, { args: [], directory: entry.projectPath });
    }
  }

  // The panes with a live shell opened in this folder: the ones a removal kills.
  function shellsIn(worktreePath: string): string[] {
    return Array.from(commands)
      .filter(([id, command]) => command.directory === worktreePath && shells.has(id))
      .map(([id]) => id);
  }

  // The pair the renderer draws a card's badge and the status bar's branch from. WorktreeList in bridge.ts
  // is where the two of them being one answer is explained.
  //
  // The directories are read straight off the pane commands rather than tracked beside them, so there
  // is one copy of them. It is the spawn cwd, not the shell's: `cd` in a pane never reaches here, so the
  // branch the status bar prints is the one the pane was opened in.
  function list(): WorktreeList {
    return {
      entries,
      paneDirectories: Object.fromEntries(
        Array.from(commands, ([id, command]) => [id, command.directory]),
      ),
    };
  }

  // The one place the record changes after launch. Every writer goes through it, so the file on disk and
  // the screen are the same fact — a writer that updated one and not the other is how a card goes on
  // naming a worktree that is not there any more. Whether a rewrite is worth a message is
  // worktreesDiffer's to say.
  //
  // The records are what it looks at, not the pane directories riding along with them, and that is enough
  // rather than lucky: the only things that move a pane into or out of a worktree are a ship, a card's
  // agent resumed after a restart, and a worktree removed, and all three change a record here. A pane whose folder changes for any other reason —
  // a project closed, a project opened in a freed slot, an agent exiting — has moved between two
  // ordinary checkouts, which is not something the status bar prints or a badge reads.
  function set(next: WorktreeEntry[]): void {
    const changed = worktreesDiffer(entries, next);
    entries = next;
    // Neither half runs for a rewrite of what is already there — closing a project that shipped nothing
    // is one. The file already holds these bytes, written by whoever last changed them, and the board on
    // screen would be torn down and redrawn for a record nobody touched.
    if (!changed) return;
    writeWorktrees(file, entries);
    announce(list());
  }

  // Every record whose folder has stopped existing, and the panes with it. A worktree deleted by hand
  // outside the app strands a pane exactly the way one removed inside it used to, so the two share this.
  // What it does not do is kill whatever is running: a folder that went by other means may still have an
  // agent doing something, and that is not this function's to decide.
  function dropDead(): void {
    // Whether a tick that found nothing is worth a write is set's to say, so there is no second answer
    // to that question here. What counts as living is stillLiving's — a folder mid-removal is not dead
    // just because git has already unlinked it.
    const living = livingEntries(entries, stillLiving(removing, existsSync));
    for (const entry of entries) if (!living.includes(entry)) releasePanes(entry);
    set(living);
  }

  // Refused once for a dirty worktree, and only once: the changes in it exist nowhere else, so the
  // question is worth asking, and refusing forever would mean the only way out is the command line.
  //
  // A function rather than only a handler, because the review takes the same step: a card whose agent
  // has finished has its worktree thrown away before a fresh one is made on the branch.
  //
  // `projectPath` is for a worktree the app has no record of — one the manager found through git — and
  // is the project to ask git from. A recorded worktree is asked from the project its record names.
  async function remove(worktreePath: string, force: boolean, projectPath?: string): Promise<WorktreeRemoval> {
    const entry = entryForPath(entries, worktreePath);
    const project = entry?.projectPath ?? projectPath;
    // A path with no record and no project is the removal having already happened — the sweep dropped it
    // while the dialog's question was on screen, or a second `d` landed on a row that had gone. There is
    // nothing to remove and no project to ask git from, and the goal state already holds, so this
    // answers yes rather than refusing. Refusing sends the dialog down its failure path and offers to
    // force-delete a folder that is not there.
    if (!project) return { ok: true, message: '', dirty: [] };
    removing.add(worktreePath);
    try {
      // A folder deleted by hand cannot be asked whether it is dirty: git is spawned into a cwd that is
      // not there, and node fails with `spawn git ENOENT` — its own failure to start a process, which
      // read as the reason your removal was refused and told you nothing you could act on. Nothing is at
      // risk in a folder that is gone, and git's own unforced remove is happy to prune a worktree whose
      // folder has vanished, so the question is skipped rather than asked and lost.
      //
      // changedFiles, not blockingChanges: this refusal exists to ask before git does, and git counts
      // .dashboard/ like any other folder. Ask the ship's narrower question here and a worktree holding
      // nothing but an uncommitted board move sails past, straight into git saying no in its own words.
      const dirty = existsSync(worktreePath)
        ? changedFiles(await git(['status', '--porcelain'], worktreePath))
        : [];
      if (dirty.length > 0 && !force) return { ok: false, message: '', dirty };
      await git(['worktree', 'remove', ...(force ? ['--force'] : []), worktreePath], project);
      forgetSize(worktreePath);
      // A worktree with no record has no agent of the app's in it, so a shell of yours standing there is
      // left alone.
      if (!entry) return { ok: true, message: `removed ${baseName(worktreePath)}`, dirty: [] };
      // The agent goes with the folder it was working in: leaving it running leaves it writing into a
      // directory git has just deleted. Only here, where the folder was deleted on purpose.
      for (const id of shellsIn(worktreePath)) shells.get(id)?.kill();
      releasePanes(entry);
      set(withoutWorktree(entries, worktreePath));
      return { ok: true, message: `removed ${entry.branch}`, dirty: [] };
    } catch (error: unknown) {
      return {
        ok: false,
        message: `not removed: ${failureText(error)}`,
        dirty: [],
      };
    } finally {
      // In a finally, so a removal that throws part way cannot hold a dead record past the sweep for the
      // rest of the run.
      removing.delete(worktreePath);
    }
  }

  return { entries: () => entries, list, set, dropDead, remove, shellsIn };
}
