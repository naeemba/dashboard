#!/bin/sh
# Rebuild Dashboard and swap the new build into place, without touching the running app. It is not
# launched and not quit; the next restart picks the change up. On a mac that place is
# /Applications/Dashboard.app; on Linux it is ~/.local/opt/dashboard, whose Dashboard executable a desktop entry of your own can run;
# on Windows (Git Bash) it is %LOCALAPPDATA%\Programs\Dashboard, beside and apart from a Squirrel install.
# The prepackage hook stops the build if an app is running out of this checkout.
set -eu

cd "$(dirname "$0")/.."
repo=$(pwd -P)

os=$(uname -s)
windows=
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
  MINGW*|MSYS*|CYGWIN*)
    windows=yes
    parent="$(cygpath -u "$LOCALAPPDATA")/Programs"
    name=Dashboard
    pattern='out/Dashboard-win32-*'
    copy='cp -a'
    executable=Dashboard.exe
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
# The stamp the build carries (vite.build-version.ts), read out of the staged app.asar, which keeps
# main.cjs as plain text. Checked before the swap, so a build this checkout did not make never
# replaces the installed one.
stamp="$(node -p 'require("./package.json").version')+$(git rev-parse --short=12 HEAD)"
grep -a -q -F "$stamp" "$staged/$resources/app.asar" || { rm -rf "$staged"; echo "Stopped: the build does not carry $stamp; $installed is unchanged."; exit 1; }
# Windows refuses to rename a folder whose Dashboard.exe is running; stop then, with the installed build in place.
if [ -d "$installed" ]; then
  mv "$installed" "$previous" || { rm -rf "$staged"; echo "Stopped: could not move $installed aside (on Windows, a Dashboard running from it holds it); it is unchanged. Quit it yourself and run this again."; exit 1; }
fi
# A virus scanner still reading the new Dashboard.exe can fail this rename on Windows: put the old build back.
mv "$staged" "$installed" || { [ -d "$previous" ] && mv "$previous" "$installed"; rm -rf "$staged"; echo "Stopped: could not move the new build into $installed; it is as it was before this run."; exit 1; }
rm -rf "$previous"

# The `dashboard` command for any terminal: no words open the app, `dashboard <noun> ...` runs the
# command entry under node (docs/command). Written beside and renamed over, never through: the old
# launcher was a symlink to the app's executable, and writing through it would overwrite the app.
# node, not the app's own binary as node: the RunAsNode fuse is off (forge.config.ts, command-decision-3).
launcher="$HOME/.local/bin/dashboard"
# The paths the launcher hands to node: a Windows node reads C:/..., not the shell's /c/...
target_app="$installed/$executable"
target_entry="$installed/$resources/app.asar.unpacked/.vite/build/dashboard-cli-entry.js"
if [ -n "$windows" ]; then
  target_app=$(cygpath -m "$target_app")
  target_entry=$(cygpath -m "$target_entry")
fi
mkdir -p "$(dirname "$launcher")"
cat > "$launcher.new" <<LAUNCHER
#!/bin/sh
# Written by the Dashboard's scripts/rebuild.sh; rebuilding writes it again.
command -v node >/dev/null 2>&1 || { echo "dashboard: node is not on PATH, and the command runs under it" >&2; exit 1; }
DASHBOARD_APP='$target_app' exec node '$target_entry' "\$@"
LAUNCHER
chmod 755 "$launcher.new"
mv -f "$launcher.new" "$launcher"
# cmd and PowerShell do not run a sh script: the same launcher as a .cmd beside it.
if [ -n "$windows" ]; then
  printf '@echo off\r\nsetlocal\r\nrem Written by the Dashboard'"'"'s scripts/rebuild.sh; rebuilding writes it again.\r\nset "DASHBOARD_APP=%s"\r\nnode "%s" %%*\r\n' "$target_app" "$target_entry" > "$launcher.cmd.new"
  mv -f "$launcher.cmd.new" "$launcher.cmd"
  # A Start menu entry, so Windows search finds this build; "(rebuild)" keeps it apart from a Squirrel install's.
  DASHBOARD_EXE=$(cygpath -w "$installed/$executable") powershell.exe -NoProfile -Command '$l = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Dashboard (rebuild).lnk"; $s = (New-Object -ComObject WScript.Shell).CreateShortcut($l); $s.TargetPath = $env:DASHBOARD_EXE; $s.WorkingDirectory = Split-Path $env:DASHBOARD_EXE; $s.Save()'
fi

echo "Installed $stamp in $installed, and $launcher. The running app is untouched — restart it when you are ready."
