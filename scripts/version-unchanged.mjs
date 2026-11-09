// CI's check that a pull request leaves package.json's version alone (workflow-rule-3). Run on the
// pull request's merge commit, whose first parent is the base:
//   node scripts/version-unchanged.mjs "$(git show HEAD^1:package.json)"
/* global process, console */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Why the pull request is refused, or '' when its version is the base's.
export function versionRefusal(baseVersion, headVersion) {
  if (baseVersion === headVersion) return '';
  return `package.json version moved from ${baseVersion} to ${headVersion}. A card leaves it alone; only the Release workflow bumps it (workflow-rule-3). Put it back to ${baseVersion}.`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const base = JSON.parse(process.argv[2]).version;
  const head = JSON.parse(readFileSync('package.json', 'utf8')).version;
  const refusal = versionRefusal(base, head);
  if (refusal) {
    console.error(`::error file=package.json::${refusal}`);
    process.exit(1);
  }
}
