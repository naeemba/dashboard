#!/bin/sh
# Refuse to package while an app is running out of this checkout. Packaging wipes out/ and
# .vite/, and pulling those files out from under a process that is executing them is a
# SIGBUS crash. Runs as npm's prepackage hook, so it covers every route to a build.
set -eu

cd "$(dirname "$0")/.."
repo=$(pwd -P)

running=$(ps -Ao command= | grep -F "$repo/" | grep -E "/(out|\.vite)/|/node_modules/electron/" || true)
[ -n "$running" ] || exit 0

echo "Stopped: an app is running out of this repo, and building would delete the files it is"
echo "executing. Quit it first, or restart it from /Applications instead."
echo "$running" | cut -c1-160
exit 1
