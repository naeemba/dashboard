import { execFileSync } from 'node:child_process';
import { version } from './package.json';

// What every build calls itself: package.json's version plus the commit it was built from, so two builds
// of the same release still tell apart. package.json moves only on a release; the commit moves with
// every merge. The commit is pinned at 12 digits: the remote host compares stamps as exact strings, and
// a bare --short lets each clone pick its own length. Outside a git checkout the commit is `unknown`
// rather than a failed build.
export function git(...gitArguments: string[]): string {
  return execFileSync('git', gitArguments, { cwd: __dirname, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

// What `read` answers, or `fallback` when it throws: every build-time git read is allowed to fail.
export function attempt<Value>(read: () => Value, fallback: Value): Value {
  try {
    return read();
  } catch {
    return fallback;
  }
}

const commit = attempt(() => git('rev-parse', '--short=12', 'HEAD').trim(), 'unknown');

export const buildVersionDefine = { __BUILD_VERSION__: JSON.stringify(`${version}+${commit}`) };
