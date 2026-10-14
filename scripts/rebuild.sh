#!/bin/sh
# Rebuild Dashboard and swap the new build into place, without touching the running app. It is not
# launched and not quit; the next restart picks the change up. On a mac that place is
# /Applications/Dashboard.app; on Linux it is ~/.local/opt/dashboard, the folder the desktop entry runs.
# The prepackage hook stops the build if an app is running out of this checkout.
set -eu

cd "$(dirname "$0")/.."
repo=$(pwd -P)

os=$(uname -s)
case "$os" in
  Darwin)
    parent=/Applications
    name=Dashboard.app
    pattern='out/*/Dashboard.app'
    copy=ditto
    ;;
  Linux)
    parent="$HOME/.local/opt"
    name=dashboard
    pattern='out/Dashboard-linux-*'
    copy='cp -a'
    ;;
  *)
    echo "Stopped: no install location for $os."
    exit 1
    ;;
esac

installed="$parent/$name"
staged="$parent/.$name.rebuild"
previous="$parent/.$name.previous"

npm run package

# Unquoted on purpose, so the shell expands the pattern.
built=$(ls -d "$repo"/$pattern 2>/dev/null | head -1)
[ -n "$built" ] || { echo "Stopped: the build produced nothing to install in $parent."; exit 1; }

# Copy to a staging path first, then rename. Never write over the installed build in place:
# a running copy pages its code in lazily, and rewriting those bytes underneath it kills it.
# After the rename the old build is only unlinked, so the running app keeps its own files.
mkdir -p "$parent"
rm -rf "$staged" "$previous"
$copy "$built" "$staged"
if [ -d "$installed" ]; then mv "$installed" "$previous"; fi
mv "$staged" "$installed"
rm -rf "$previous"

echo "Installed $installed. The running app is untouched — restart it when you are ready."
