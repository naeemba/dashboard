import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  // node-pty loads a native .node binary at runtime via a dynamic require.
  // Rollup can't bundle that call, so keep node-pty as a real require instead.
  build: {
    rollupOptions: {
      // The Agent SDK is ESM that finds and spawns a native binary at runtime, and it is loaded with a
      // dynamic import the first time a chat prompt is sent. Kept a real import, and shipped whole.
      external: ['node-pty', '@anthropic-ai/claude-agent-sdk'],
    },
  },
});
