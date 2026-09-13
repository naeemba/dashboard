import { defineConfig } from 'vite';

// The `board` command, bundled to one file with no imports left in it, so `node board-cli.js` runs
// with nothing beside it. Forge's plugin fills in the entry and the output directory; there is
// nothing external here to keep out of the bundle the way node-pty is in the main config.
export default defineConfig({});
