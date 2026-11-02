import { defineConfig, mergeConfig } from 'vite';
import mainConfig from './vite.main.config';

// The create-task program. A .js name, like the board command's; the copy the app installs under
// ~/.claude runs under plain `node` as CommonJS because a package.json saying so is installed beside it.
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
