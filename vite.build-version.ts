import { execFileSync } from 'node:child_process';
import { version } from './package.json';

// What every build calls itself: package.json's version plus the commit it was built from, so two builds
// of the same release still tell apart. package.json moves only on a release; the commit moves with
// every merge. Outside a git checkout the commit is `unknown` rather than a failed build.
function commit(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: __dirname, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

export const buildVersionDefine = { __BUILD_VERSION__: JSON.stringify(`${version}+${commit()}`) };
