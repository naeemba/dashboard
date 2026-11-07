---
description: Cut a Dashboard release with the bump the user names (/release minor), then install it here without restarting the app
argument-hint: <major|minor|patch>
disable-model-invocation: true
allowed-tools: Bash(./scripts/release.sh:*)
model: sonnet
effort: low
---

Run `./scripts/release.sh $ARGUMENTS` from the top of this repository and report what it printed: the
version, the release URL and "restart the app when ready", or the reason it stopped.

Run it only because the user typed `/release` just now. A release publishes to everyone who downloads
the app, so it is never chained onto a merge, never started on your own judgement, and never retried
without being asked. If no bump was given, ask which one (major, minor or patch); do not pick one.

If the script stops, stop with it. Do not dispatch the workflow by hand, do not fix main to get past a
refusal, and do not quit or restart the running app. Say the reason it gave and leave it to the user.
A run that stopped on a failed leg is finished later with `./scripts/release.sh --resume <run id>`, once
the user has re-run the failed jobs.
