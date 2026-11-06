import { defineConfig } from 'vite';
import { buildVersionDefine } from './vite.build-version';

// The screen host, run by `node` and not by Electron, and unpacked from the asar beside the commands.
// Not merged with main's config, which keeps the Agent SDK external: `node` cannot read the copy inside
// the asar, so the SDK is bundled in here. An ES module, .mjs, because the SDK reads import.meta.url as
// it loads, which a CommonJS bundle leaves empty. The CLI binary it drives is named by the app.
export default defineConfig({
  define: buildVersionDefine,
  build: {
    lib: {
      entry: 'src/main/workers/screen-host-entry.ts',
      fileName: () => 'screen-host-entry.mjs',
      formats: ['es'],
    },
  },
});
