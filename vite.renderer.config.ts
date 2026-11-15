import { defineConfig } from 'vite';
import { buildVersionDefine } from './vite.build-version';
import { readChangelog } from './vite.changelog';

// https://vitejs.dev/config
export default defineConfig({
  define: { ...buildVersionDefine, __CHANGELOG__: JSON.stringify(readChangelog()) },
  // An address, not `localhost`: on Windows the dev server bound `localhost` to ::1 alone while the
  // window asked 127.0.0.1, so `pnpm start` opened an empty window on ERR_CONNECTION_REFUSED.
  // Forge builds the window's URL from this same host, so the two cannot disagree.
  server: { host: '127.0.0.1' },
});
