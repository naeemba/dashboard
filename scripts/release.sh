#!/bin/sh
# Cut a release in one command, then install it here (docs/workflow, "How to release").
#
#   scripts/release.sh <major|minor|patch>    dispatch release.yml with the bump, watch it, install it
#   scripts/release.sh --resume <run id>      watch a run already started (or finished), install it
#
# It never quits, starts or restarts the running app (workflow-rule-1): rebuild.sh only swaps the
# installed build, and the new one shows on the next restart.
set -eu

cd "$(dirname "$0")/.."

stop() {
  echo "Stopped: $*" >&2
  exit 1
}

case "${1:-}" in
  major | minor | patch) bump=$1 ;;
  --resume) [ -n "${2:-}" ] || stop "--resume takes the run id."; run=$2 ;;
  *) stop "say which part moves: scripts/release.sh <major|minor|patch>, or --resume <run id>." ;;
esac

# Every refusal before anything is dispatched. A resume makes the same checks: it pulls into main and
# builds it, so main has to be what was released.
[ "$(git symbolic-ref --quiet --short HEAD || true)" = main ] || stop "check out main first; the release builds main."
[ -z "$(git status --porcelain)" ] || stop "main has uncommitted changes. Commit or remove them first."
git fetch --quiet --tags origin
head=$(git rev-parse HEAD)
[ "$head" = "$(git rev-parse origin/main)" ] || stop "main is not origin/main. Pull or push until they match."

if [ -n "${bump:-}" ]; then
  # The newest CI run on this commit, which a re-run updates in place.
  ci=$(gh run list --workflow ci.yml --commit "$head" --limit 1 --json status,conclusion --jq '.[0] | "\(.status) \(.conclusion)"')
  case "$ci" in
    '') stop "CI has not run on $head yet." ;;
    'completed success') ;;
    completed*) stop "CI failed on $head (${ci#completed }). Fix main first." ;;
    *) stop "CI is still running on $head. Try again when it is green." ;;
  esac

  # The run this dispatch makes is the first newest run that was not there before.
  newest() { gh run list --workflow release.yml --event workflow_dispatch --limit 1 --json databaseId --jq '.[0].databaseId // ""'; }
  before=$(newest)
  gh workflow run release.yml --ref main -f bump="$bump"
  for _ in $(seq 30); do
    run=$(newest)
    [ -n "$run" ] && [ "$run" != "$before" ] && break
    sleep 2
  done
  [ -n "$run" ] && [ "$run" != "$before" ] || stop "dispatched, but no new Release run showed up in a minute. Find it in the Actions tab and run scripts/release.sh --resume <run id>."
fi

url=$(gh run view "$run" --json url --jq .url)
echo "Watching $url"
if ! gh run watch "$run" --exit-status > /dev/null; then
  failed=$(gh run view "$run" --json jobs --jq '[.jobs[] | select(.conclusion != "success" and .conclusion != "skipped" and .conclusion != null) | .name] | join(", ")')
  stop "the run failed in ${failed:-a job}, so the release stays a draft. Re-run the failed jobs, then scripts/release.sh --resume $run."
fi

# The release a run made: the first stable tag on main after the commit it ran on. A pre-release tag
# run's commit is on no stable tag, and is not installed from here.
git fetch --quiet --tags origin
sha=$(gh run view "$run" --json headSha --jq .headSha)
tag=$(git tag --merged origin/main --contains "$sha" --sort=v:refname 'v*' | sed '/-/d' | head -n 1)
[ -n "$tag" ] || stop "run $run released no version on main; a pre-release tag run is not installed from here."

git merge --quiet --ff-only origin/main
pnpm install --frozen-lockfile
pnpm exec tsc --noEmit
pnpm exec eslint .
pnpm test
# rebuild.sh stops unless the installed build carries this checkout's stamp.
scripts/rebuild.sh

echo
echo "Released $tag: $(gh release view "$tag" --json url --jq .url)"
echo "Restart the app when ready."
