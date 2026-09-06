#!/bin/sh
# Rebuild Dashboard and swap the new bundle into /Applications, without touching the
# running app. It is not launched and not quit; the next restart picks the change up.
# The prepackage hook stops the build if an app is running out of this checkout.
set -eu

cd "$(dirname "$0")/.."
repo=$(pwd -P)
installed=/Applications/Dashboard.app
staged=/Applications/.Dashboard.app.rebuild
previous=/Applications/.Dashboard.app.previous

npm run package

built=$(ls -d "$repo"/out/*/Dashboard.app 2>/dev/null | head -1)
[ -n "$built" ] || { echo "Stopped: the build produced no Dashboard.app."; exit 1; }

# Copy to a staging path first, then rename. Never write over the installed bundle in place:
# a running copy pages its code in lazily, and rewriting those bytes underneath it kills it.
# After the rename the old bundle is only unlinked, so the running app keeps its own files.
rm -rf "$staged" "$previous"
ditto "$built" "$staged"
if [ -d "$installed" ]; then mv "$installed" "$previous"; fi
mv "$staged" "$installed"
rm -rf "$previous"

echo "Installed $installed. The running app is untouched — restart it when you are ready."
