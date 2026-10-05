import { defineConfig, mergeConfig } from 'vite';
import mainConfig from './vite.main.config';

// Forge 8 names every main-target bundle [name].cjs. The board command keeps its .js name: shells
// the running app opened before an upgrade hold DASHBOARD_BOARD pointing at board-cli-entry.js, and
// renaming it would break `node "$DASHBOARD_BOARD"` in all of them until the app restarts. With no
// "type": "module" in package.json, node still reads a .js file as CommonJS.
export default mergeConfig(
  mainConfig,
  defineConfig({
    build: {
      lib: {
        entry: 'src/board-cli-entry.ts',
        fileName: () => 'board-cli-entry.js',
        formats: ['cjs'],
      },
    },
  }),
);
