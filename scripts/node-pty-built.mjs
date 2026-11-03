// Put node-pty's binary where the package will look for it. `pnpm install` leaves build/ empty and
// unpacks the prebuilt binary into prebuilds/ instead, which is what every fresh worktree gets.
// forge.config copies build/Release and nothing else, so packaging from such a checkout ships
// node-pty's JS with no binary beside it and the app dies at launch with "Failed to load native
// module: pty.node". Packaging itself says nothing, so this is where it gets caught.
//
// Copied rather than compiled: the binary is N-API, so the same file loads under node and under
// Electron, and building from source needs a working macOS SDK or Visual Studio that a machine may
// not have. Linux has no prebuilt binary: pnpm install compiles one into build/Release, so there this
// finds it already there and does nothing.
//
// The whole folder, because what sits beside pty.node differs by platform: spawn-helper on a mac,
// conpty.node, conpty_console_list.node and conpty/ on Windows. The prebuilt spawn-helper arrives
// without its exec bit, and posix_spawnp fails without it.
//
// Only what build/Release lacks is copied, and nothing there is overwritten. On Windows node-pty's
// install script has already put conpty/ there, and pnpm restores it from its store as hard links:
// copying the prebuilt conpty/ over it failed in CI with "EPIPE, The process cannot access the file
// because it is being used by another process", and a write into a hard-linked file would change the
// store's copy, which every other worktree shares.
//
// Node rather than sh so the same hook runs on Windows, where pnpm runs scripts with cmd.exe.
/* global process, console */
import { chmodSync, cpSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const nodePty = join(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', 'node-pty');
const release = join(nodePty, 'build', 'Release');
if (existsSync(join(release, 'pty.node'))) process.exit(0);

const platform = `${process.platform}-${process.arch}`;
const prebuilt = join(nodePty, 'prebuilds', platform);
if (!existsSync(join(prebuilt, 'pty.node'))) {
  console.error(`node-pty has no built binary and no prebuilt one for ${platform}; run pnpm rebuild node-pty.`);
  process.exit(1);
}
console.log(`node-pty has no built binary in this checkout; taking the prebuilt one from ${prebuilt}.`);
for (const entry of readdirSync(prebuilt)) {
  if (!existsSync(join(release, entry))) cpSync(join(prebuilt, entry), join(release, entry), { recursive: true });
}
const spawnHelper = join(release, 'spawn-helper');
if (existsSync(spawnHelper)) chmodSync(spawnHelper, 0o755);
