#!/bin/sh
# Rebuild Dashboard and swap the new build into place, without touching the running app. It is not
# launched and not quit; the next restart picks the change up. On a mac that place is
# /Applications/Dashboard.app; on Linux it is ~/.local/opt/dashboard, whose Dashboard executable a desktop entry of your own can run.
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
    executable=Contents/MacOS/Dashboard
    resources=Contents/Resources
    ;;
  Linux)
    parent="$HOME/.local/opt"
    name=dashboard
    pattern='out/Dashboard-linux-*'
    copy='cp -a'
    executable=Dashboard
    resources=resources
    ;;
  *)
    echo "Stopped: no install location for $os."
    exit 1
    ;;
esac

installed="$parent/$name"
staged="$parent/.$name.rebuild"
previous="$parent/.$name.previous"

pnpm run package

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

# The `dashboard` command for any terminal: no words open the app, `dashboard <noun> ...` runs the
# command entry under node (docs/command). Written beside and renamed over, never through: the old
# launcher was a symlink to the app's executable, and writing through it would overwrite the app.
# node, not the app's own binary as node: the RunAsNode fuse is off (forge.config.ts, command-decision-3).
launcher="$HOME/.local/bin/dashboard"
mkdir -p "$(dirname "$launcher")"
cat > "$launcher.new" <<LAUNCHER
#!/bin/sh
# Written by the Dashboard's scripts/rebuild.sh; rebuilding writes it again.
command -v node >/dev/null 2>&1 || { echo "dashboard: node is not on PATH, and the command runs under it" >&2; exit 1; }
DASHBOARD_APP='$installed/$executable' exec node '$installed/$resources/app.asar.unpacked/.vite/build/dashboard-cli-entry.js' "\$@"
LAUNCHER
chmod 755 "$launcher.new"
mv -f "$launcher.new" "$launcher"

echo "Installed $installed and $launcher. The running app is untouched — restart it when you are ready."
