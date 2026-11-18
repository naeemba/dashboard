// What the pre-commit hook checks (workflow-rule-5). The entry is scripts/pre-commit-step.mjs, kept apart
// so importing this file never runs the checks.

const CODE = /\.(ts|mts|cts|js|mjs|cjs)$/;
// Files that change what tsc reports without being code: its settings and the installed type packages.
const TYPE_SETTINGS = /^(tsconfig[^/]*\.json|package\.json|pnpm-lock\.yaml)$/;
// Files that change what eslint reports in files nobody staged: its settings and the installed plugins.
const LINT_SETTINGS = /^(eslint\.config\.[^/]+|package\.json|pnpm-lock\.yaml)$/;

// What eslint reads: the staged code, or the whole project (`.`) when its settings are staged.
export function filesToCheck(stagedFiles) {
  if (stagedFiles.some((file) => LINT_SETTINGS.test(file))) return ['.'];
  return stagedFiles.filter((file) => CODE.test(file));
}

// Whether tsc runs: staged code or type settings. A board-only commit (`.dashboard/` holds json and md)
// never waits on it.
export function runsTypecheck(stagedFiles) {
  return stagedFiles.some((file) => CODE.test(file) || TYPE_SETTINGS.test(file));
}

// Why the commit is refused for want of eslint or tsc, or '' when it goes on. Only a commit the tools would
// have checked is refused: a fresh worktree's code commit went through unchecked and a broken merge
// reached a pull request, while the app and the board command commit cards from checkouts with no
// node_modules, and a card must never fail on a missing tool.
export function missingToolsRefusal(stagedFiles, { toolsInstalled }) {
  if (toolsInstalled || (filesToCheck(stagedFiles).length === 0 && !runsTypecheck(stagedFiles))) return '';
  return 'This checkout has no eslint or tsc in node_modules, so the staged code cannot be checked. Run pnpm install, then commit again.';
}
