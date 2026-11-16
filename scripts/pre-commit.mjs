// What the pre-commit hook checks (workflow-rule-5). The entry is scripts/pre-commit-step.mjs, kept apart
// so importing this file never runs the checks.

const CODE = /\.(ts|mts|cts|js|mjs|cjs)$/;
// Files that change what tsc reports without being code: its settings and the installed type packages.
const TYPE_SETTINGS = /^(tsconfig[^/]*\.json|package\.json|pnpm-lock\.yaml)$/;

// The staged files eslint reads. A checkout with no eslint or tsc installed checks nothing, so a card
// committed from a throwaway worktree never fails on a missing tool.
export function filesToCheck(stagedFiles, { toolsInstalled }) {
  return toolsInstalled ? stagedFiles.filter((file) => CODE.test(file)) : [];
}

// Whether tsc runs: staged code or type settings. A board-only commit (`.dashboard/` holds json and md)
// never waits on it.
export function runsTypecheck(stagedFiles, { toolsInstalled }) {
  return toolsInstalled && stagedFiles.some((file) => CODE.test(file) || TYPE_SETTINGS.test(file));
}
