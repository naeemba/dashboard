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

// What to do once `gh run watch --exit-status` has returned non-zero, given the run's status and
// conclusion. The watch also fails when GitHub drops the connection ('failed to get run: ... EOF')
// while the run goes on, so a run that has not completed is watched again, and one that completed
// green after a dropped watch is installed. Only a completed run that is not green failed.
export function afterWatch(status, conclusion) {
  if (status !== 'completed') return 'watch';
  return conclusion === 'success' ? 'install' : 'failed';
}
