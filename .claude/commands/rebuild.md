---
description: Rebuild Dashboard and install it to /Applications without launching or quitting anything
allowed-tools: Bash(./scripts/rebuild.sh)
---

Run `./scripts/rebuild.sh` and report what it printed.

The script builds the app and swaps the new bundle into `/Applications`. It never
launches the new version and never quits the running one — the change appears the
next time I restart the app myself.

If the script exits non-zero, stop. Do not build by hand, do not retry, do not quit
anything to clear the way. Tell me the reason it gave and leave it to me.
