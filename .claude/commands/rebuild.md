---
description: Rebuild Dashboard and install it (/Applications on a mac, ~/.local/opt/dashboard on Linux) without launching or quitting anything
allowed-tools: Bash(./scripts/rebuild.sh)
model: sonnet
effort: low
---

Run `./scripts/rebuild.sh` and report what it printed.

The script builds the app and swaps the new build into place: `/Applications` on a mac,
`~/.local/opt/dashboard` on Linux. It never
launches the new version and never quits the running one — the change appears the
next time I restart the app myself.

If the script exits non-zero, stop. Do not build by hand, do not retry, do not quit
anything to clear the way. Tell me the reason it gave and leave it to me.
