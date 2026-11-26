import { describe, it } from 'vitest';
import { hasScreenHost } from '../workers/screen-host-protocol';

// A test that sets or reads POSIX file modes skips on Windows, which has none: chmod neither locks a
// folder against writes nor leaves a mode to read back.
export const posixModesOnly = it.skipIf(process.platform === 'win32');

// A test that runs a POSIX shell script or command (a `#!/bin/sh` stand-in for git's upload-pack,
// `env`, `cat`) skips on Windows, which can run none of them.
export const posixCommandsOnly = it.skipIf(process.platform === 'win32');

// A test that half-closes a socket and reads the answer skips on Windows: a named pipe closes whole,
// leaving nobody to read what the other side sends back.
export const halfOpenSocketsOnly = it.skipIf(process.platform === 'win32');

// Suite-level skips, for a describe whose every test shares the reason. A suite that runs a POSIX
// shell or command (`sh -c`, a login `/bin/sh`, `zip` and `unzip`) skips on Windows, as above.
export const posixCommandsSuite = describe.skipIf(process.platform === 'win32');

// A suite that finds a stale socket file and claims it skips on Windows, whose named pipe leaves no
// file behind to find (prepareHostSocket in pane-host-protocol.ts does nothing there).
export const socketFilesSuite = describe.skipIf(process.platform === 'win32');

// A suite that drives the screen host skips where there is none: Windows (hasScreenHost).
export const screenHostSuite = describe.skipIf(!hasScreenHost(process.platform));
