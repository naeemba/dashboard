import { defineConfig, mergeConfig } from 'vite';
import mainConfig from './vite.main.config';

// The pane host, run by `node` and not by Electron, so it keeps a .js name for the reason
// vite.board-cli.config.ts gives, and is unpacked from the asar beside the commands.
export default mergeConfig(
  mainConfig,
  defineConfig({
    build: {
      lib: {
        entry: 'src/main/panes/pane-host-entry.ts',
        fileName: () => 'pane-host-entry.js',
        formats: ['cjs'],
      },
    },
  }),
);
