#!/bin/sh
# Put node-pty's binary where the package will look for it. `npm install` leaves build/ empty and
# unpacks the prebuilt binary into prebuilds/ instead, which is what every fresh worktree gets.
# forge.config copies build/Release and nothing else, so packaging from such a checkout ships
# node-pty's JS with no binary beside it and the app dies at launch with "Failed to load native
# module: pty.node". Packaging itself says nothing, so this is where it gets caught.
#
# Copied rather than compiled: the binary is N-API, so the same file loads under node and under
# Electron, and building from source needs a working macOS SDK that a machine may not have.
# The prebuilt spawn-helper arrives without its exec bit, and posix_spawnp fails without it.
set -eu

cd "$(dirname "$0")/.."
[ -f node_modules/node-pty/build/Release/pty.node ] && exit 0

prebuilt="node_modules/node-pty/prebuilds/$(node -p 'process.platform + "-" + process.arch')"
echo "node-pty has no built binary in this checkout; taking the prebuilt one from $prebuilt."
mkdir -p node_modules/node-pty/build/Release
cp "$prebuilt/pty.node" "$prebuilt/spawn-helper" node_modules/node-pty/build/Release/
chmod +x node_modules/node-pty/build/Release/spawn-helper
