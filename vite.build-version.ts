import { execFileSync } from 'node:child_process';
import { version } from './package.json';

// What every build calls itself: package.json's version plus the commit it was built from, so two builds
// of the same release still tell apart. package.json moves only on a release; the commit moves with
// every merge. The commit is pinned at 12 digits: the remote host compares stamps as exact strings, and
// a bare --short lets each clone pick its own length. Outside a git checkout the commit is `unknown`
// rather than a failed build.
function commit(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { cwd: __dirname, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

export const buildVersionDefine = { __BUILD_VERSION__: JSON.stringify(`${version}+${commit()}`) };
