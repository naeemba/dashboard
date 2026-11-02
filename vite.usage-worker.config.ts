import { defineConfig, mergeConfig } from 'vite';
import mainConfig from './vite.main.config';

// The usage sweep's own thread, started by usage-thread.ts from the path beside main. The name is
// that path, so it is fixed here rather than left to Forge's [name].cjs.
export default mergeConfig(
  mainConfig,
  defineConfig({
    build: {
      lib: {
        entry: 'src/main/usage/usage-worker.ts',
        fileName: () => 'usage-worker.js',
        formats: ['cjs'],
      },
    },
  }),
);
