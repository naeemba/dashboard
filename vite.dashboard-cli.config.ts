import { defineConfig, mergeConfig } from 'vite';
import mainConfig from './vite.main.config';

// The `dashboard` command, built like the `board` and `session` ones: a .js name so node reads it as
// CommonJS, and the same name for the life of the app, since running shells hold DASHBOARD_COMMAND
// pointing at it.
export default mergeConfig(
  mainConfig,
  defineConfig({
    build: {
      lib: {
        entry: 'src/main/command/dashboard-cli-entry.ts',
        fileName: () => 'dashboard-cli-entry.js',
        formats: ['cjs'],
      },
    },
  }),
);
