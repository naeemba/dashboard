// What the pre-commit hook checks (workflow-rule-5). The entry is scripts/pre-commit-step.mjs, kept apart
// so importing this file never runs the checks.

const CODE = /\.(ts|mts|cts|js|mjs|cjs)$/;

// The staged files eslint reads; none skips both checks, so a board-only commit (`.dashboard/` holds
// json and md) never waits on tsc.
export function filesToCheck(stagedFiles) {
  return stagedFiles.filter((file) => CODE.test(file));
}
