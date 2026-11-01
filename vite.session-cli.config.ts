import { defineConfig, mergeConfig } from 'vite';
import mainConfig from './vite.main.config';

// The `session` command, built like the `board` one: a .js name so node reads it as CommonJS, and
// the same name for the life of the app, since running shells hold DASHBOARD_SESSION pointing at it.
export default mergeConfig(
  mainConfig,
  defineConfig({
    build: {
      lib: {
        entry: 'src/main/workers/session-cli-entry.ts',
        fileName: () => 'session-cli-entry.js',
        formats: ['cjs'],
      },
    },
  }),
);
