import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  // node-pty loads a native .node binary at runtime via a dynamic require.
  // Rollup can't bundle that call, so keep node-pty as a real require instead.
  build: {
    rollupOptions: {
      external: ['node-pty'],
    },
  },
});
