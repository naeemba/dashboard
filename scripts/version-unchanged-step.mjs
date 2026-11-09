// CI's way into version-unchanged.mjs. Run on the pull request's merge commit, whose first parent is
// the base:
//   node scripts/version-unchanged-step.mjs "$(git show HEAD^1:package.json)"
/* global process, console */
import { readFileSync } from 'node:fs';
import { versionRefusal } from './version-unchanged.mjs';

if (process.argv.length !== 3) {
  console.error('Usage: version-unchanged-step.mjs <base package.json contents>');
  process.exit(1);
}
const base = JSON.parse(process.argv[2]).version;
const head = JSON.parse(readFileSync('package.json', 'utf8')).version;
const refusal = versionRefusal(base, head);
if (refusal) {
  console.error(`::error file=package.json::${refusal}`);
  process.exit(1);
}
