// CI's way into board-unchanged.mjs. Run on the pull request's merge commit, whose first parent is the
// base, so the diff is what the pull request brings:
//   node scripts/board-unchanged-step.mjs "$GITHUB_BASE_REF"
/* global process, console */
import { execFileSync } from 'node:child_process';
import { boardRefusal } from './board-unchanged.mjs';

if (process.argv.length !== 3) {
  console.error('Usage: board-unchanged-step.mjs <base branch>');
  process.exit(1);
}
const changed = execFileSync('git', ['diff', '--name-only', '-z', 'HEAD^1', 'HEAD'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
const refusal = boardRefusal(changed, process.argv[2]);
if (refusal) {
  console.error(`::error::${refusal}`);
  process.exit(1);
}
