#!/bin/sh
# Cut a release in one command, then install it here (docs/workflow, "How to release").
#
#   scripts/release.sh <major|minor|patch>    dispatch release.yml with the bump, watch it, install it
#   scripts/release.sh --resume <run id>      watch a run already started (or finished), install it
#
# It never quits, starts or restarts the running app (workflow-rule-1): rebuild.sh only swaps the
# installed build, and the new one shows on the next restart.
#
# Every way out says "Stopped:". Under set -eu a failed $(...) in an assignment exits on the spot with
# no word of why, so each one that can fail ends in `|| stop`.
set -eu

cd "$(dirname "$0")/.."

stop() {
  echo "Stopped: $*" >&2
  exit 1
}

# GitHub's API drops a request now and then ('failed to get run: ... EOF'). A read is tried four times
# over about twenty seconds before it counts as failed. Never a dispatch: that could start two runs.
retry() {
  "$@" || { sleep 2 && "$@"; } || { sleep 5 && "$@"; } || { sleep 12 && "$@"; }
}

case "${1:-}" in
  major | minor | patch) mode=bump bump=$1 ;;
  --resume) [ -n "${2:-}" ] || stop "--resume takes the run id."; mode=resume run=$2 ;;
  *) stop "say which part moves: scripts/release.sh <major|minor|patch>, or --resume <run id>." ;;
esac

# Every refusal before anything is dispatched; scripts/release-checks.mjs says which and why.
retry git fetch --quiet --tags origin || stop "could not fetch origin."
branch=$(git symbolic-ref --quiet --short HEAD || true)
tree=clean
[ -z "$(git status --porcelain)" ] || tree=dirty
head=$(git rev-parse HEAD)
if [ "$head" = "$(git rev-parse origin/main)" ]; then relation=same
elif git merge-base --is-ancestor HEAD origin/main; then relation=behind
else relation=other
fi
refusal=$(node scripts/release-checks-step.mjs main "$mode" "$branch" "$tree" "$relation") || stop "could not check main."
[ -z "$refusal" ] || stop "$refusal"

if [ "$mode" = bump ]; then
  # The newest CI run on this commit, which a re-run updates in place.
  ci=$(retry gh run list --workflow ci.yml --commit "$head" --limit 1 --json status,conclusion --jq '.[0] | "\(.status) \(.conclusion)"') \
    || stop "could not ask GitHub how CI went on $head. Try again."
  case "$ci" in
    '') stop "CI has not run on $head yet." ;;
    'completed success') ;;
    completed*) stop "CI failed on $head (${ci#completed }). Fix main first." ;;
    *) stop "CI is still running on $head. Try again when it is green." ;;
  esac

  # The run this dispatch makes is the first newest run that was not there before.
  newest() { retry gh run list --workflow release.yml --event workflow_dispatch --limit 1 --json databaseId --jq '.[0].databaseId // ""'; }
  before=$(newest) || stop "could not list the Release runs. Nothing was dispatched; try again."
  gh workflow run release.yml --ref main -f bump="$bump" \
    || stop "the dispatch failed. If a Release run started anyway in the Actions tab, run scripts/release.sh --resume <run id>; otherwise try again."
  run=
  for _ in $(seq 30); do
    run=$(newest) || run=
    [ -n "$run" ] && [ "$run" != "$before" ] && break
    sleep 2
  done
  [ -n "$run" ] && [ "$run" != "$before" ] || stop "dispatched, but no new Release run showed up in a minute. Find it in the Actions tab and run scripts/release.sh --resume <run id>."
fi

lost="lost touch with GitHub on run $run, which may still be going. Try again: scripts/release.sh --resume $run."
url=$(retry gh run view "$run" --json url --jq .url) || stop "$lost"
echo "Watching $url"
# A failed watch is not yet a failed run: GitHub dropping the connection fails it too
# (scripts/release-checks.mjs, afterWatch). Ask how the run stands, and watch again while it goes on.
until gh run watch "$run" --exit-status > /dev/null; do
  state=$(retry gh run view "$run" --json status,conclusion --jq '"\(.status) \(.conclusion)"') || stop "$lost"
  # Unquoted on purpose: a run still going has an empty conclusion, and the step takes it as absent.
  next=$(node scripts/release-checks-step.mjs after-watch $state) || stop "could not read run $run's state ($state)."
  case "$next" in
    watch) echo "The watch dropped; run $run is still going. Watching again." >&2; sleep 5 ;;
    install) break ;;
    *)
      failed=$(retry gh run view "$run" --json jobs --jq '[.jobs[] | select(.conclusion != "success" and .conclusion != "skipped" and .conclusion != null) | .name] | join(", ")') || failed=
      stop "the run failed in ${failed:-a job}, so the release stays a draft. Re-run the failed jobs, then scripts/release.sh --resume $run."
      ;;
  esac
done

# The release a run made: the first stable tag on main after the commit it ran on. A pre-release tag
# run's commit is on no stable tag, and is not installed from here.
retry git fetch --quiet --tags origin || stop "could not fetch the release tag. Try again: scripts/release.sh --resume $run."
sha=$(retry gh run view "$run" --json headSha --jq .headSha) || stop "$lost"
tag=$(git tag --merged origin/main --contains "$sha" --sort=v:refname 'v*' | sed '/-/d' | head -n 1)
[ -n "$tag" ] || stop "run $run released no version on main; a pre-release tag run is not installed from here."

# A resume's main is behind by the release commit the run pushed; a bump's is too by now.
git merge --quiet --ff-only origin/main || stop "could not fast-forward main to origin/main."
pnpm install --frozen-lockfile
pnpm exec tsc --noEmit
pnpm exec eslint .
pnpm test
# rebuild.sh stops unless the installed build carries this checkout's stamp.
scripts/rebuild.sh

release=$(retry gh release view "$tag" --json url --jq .url) || release="the Releases page"
echo
echo "Released $tag: $release"
echo "Restart the app when ready."
