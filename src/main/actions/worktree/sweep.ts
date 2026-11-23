import type { LogDraft } from '../../../shared/app/log-entry';
import { action } from '../action';
import { letGoAndSay, type Throwaway, type ThrowawayPorts } from './throwaway';

// The launch's sweep of throwaway worktrees. Which pane holds one lives in memory, so after a restart
// a throwaway whose pane closed before the quit, or that a pane restored at launch still stands in,
// would otherwise be left on disk for good. Each one a pane stands in is given back to that pane, so
// its release or close lets go of it as any other's; each one no pane holds is let go of now
// (throwaway.ts). One log line says what was removed and what was kept, and why.

export type WorktreeSweepPorts = ThrowawayPorts & {
  // Every open project's folder.
  projects(): readonly string[];
  // The throwaways the project has on disk (throwaway-marker.ts).
  throwawaysOf(projectPath: string): Promise<string[]>;
  // The open pane standing in the worktree, now holding it as a pane run --worktree's does, or undefined.
  hold(throwaway: Throwaway): string | undefined;
  log(draft: LogDraft): void;
};

export const worktreeSweep = action<WorktreeSweepPorts, Record<string, never>, { output: string }>('worktree.sweep', {
  words: [],
  input: () => ({}),
  async run(ports) {
    const said: string[] = [];
    // One at a time: each removal takes its project's queue, and git status in 30 worktrees at once
    // slows the launch for nothing.
    for (const projectPath of ports.projects()) {
      for (const worktreePath of await ports.throwawaysOf(projectPath)) {
        const throwaway: Throwaway = { worktreePath, projectPath };
        const holder = ports.hold(throwaway);
        // A git that fails on one keeps that one and sweeps the rest.
        said.push(holder === undefined ? await letGoAndSay(ports, throwaway) : `kept ${worktreePath}: pane ${holder} is in it`);
      }
    }
    if (said.length === 0) return { output: '' };
    const output = `Throwaway worktrees at launch: ${said.join('; ')}`;
    ports.log({ level: 'info', kind: 'worktree', action: 'worktree.sweep', message: output });
    return { output };
  },
});
