// What scripts/release.sh decides, kept apart from the shell so each branch can be tested.
// release-checks-step.mjs is how the script asks.

// Why main cannot be released from, or '' when it can. A bump dispatches from main, so main has to be
// exactly origin/main. A resume pulls origin/main and builds it, and the run it watches pushed its
// release commit to main, so origin/main ahead of a clean main is the expected case: the install
// fast-forwards to it. Only commits main has and origin/main lacks are refused there.
//   mode      'bump' or 'resume'
//   branch    the checked-out branch, '' when detached
//   tree      'clean' or 'dirty'
//   relation  main against origin/main: 'same', 'behind' (an ancestor) or 'other' (ahead or diverged)
export function mainRefusal(mode, branch, tree, relation) {
  if (branch !== 'main') return 'check out main first; the release builds main.';
  if (tree !== 'clean') return 'main has uncommitted changes. Commit or remove them first.';
  if (relation === 'same') return '';
  if (mode === 'resume' && relation === 'behind') return '';
  if (mode === 'resume') return 'main has commits origin/main does not. Push or drop them, then resume.';
  return 'main is not origin/main. Pull or push until they match.';
}

// Where a GitHub Actions run stands, from `gh run ... --json status,conclusion`: 'pending' until it has
// completed, then 'green' or 'failed <conclusion>'. The CI gate and the wait for the Release run both
// ask this, so they agree on what green means.
export function runOutcome({ status, conclusion }) {
  if (status !== 'completed') return 'pending';
  return conclusion === 'success' ? 'green' : `failed ${conclusion}`;
}
