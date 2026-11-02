import { defineConfig, mergeConfig } from 'vite';
import mainConfig from './vite.main.config';

// The create-task program. A .js name, like the board command's, so the copy the app installs under
// ~/.claude runs under plain `node` as CommonJS wherever it sits.
export default mergeConfig(
  mainConfig,
  defineConfig({
    build: {
      lib: {
        entry: 'src/main/board/create-task-cli-entry.ts',
        fileName: () => 'create-task-cli-entry.js',
        formats: ['cjs'],
      },
    },
  }),
);
