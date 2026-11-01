#!/bin/sh
# Start a demo instance of this checkout's build, never the installed app: its own HOME (so its own
# settings, projects.yaml and ~/.claude), its own user data, on the headless Wayland socket wl-perf that
# README.md's weston line starts, with DevTools on 9433 (renderer) and 9434 (main). Every CLAUDE_* and
# DASHBOARD_* variable of the shell it is run from is dropped, so its panes cannot reach that session.
# usage: launch-demo.sh <demo folder made by stage-demo.sh>
set -eu
demo=$(cd "$1" && pwd)
repo=$(cd "$(dirname "$0")/../.." && pwd)
export HOME="$demo/home" XDG_CONFIG_HOME="$demo/home/.config" WAYLAND_DISPLAY=wl-perf
unset DISPLAY AI_AGENT
for name in $(env | grep -o '^\(CLAUDE\|DASHBOARD\)[A-Z_]*'); do unset "$name"; done
cd "$repo"
exec ./node_modules/.bin/electron . --user-data-dir="$demo/userdata" --ozone-platform=wayland \
  --remote-debugging-port=9433 --inspect=9434
