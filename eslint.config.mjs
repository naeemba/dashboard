import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

// `@xterm/addon-serialize` is Node-only here on purpose: main runs it over `@xterm/headless`.
const nodeOnly = ['node:*', 'electron', 'node-pty', 'ws', '@xterm/headless', '@xterm/addon-serialize'];
const domOnly = ['@xterm/xterm', '@xterm/addon-fit', 'lucide', 'marked', 'highlight.js', '@fontsource/*'];
const restrict = (patterns) => ({ '@typescript-eslint/no-restricted-imports': ['error', { patterns }] });

export default defineConfig(
  { ignores: ['.vite/', 'dist/', 'out/'] },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  // Every shape in src/ is a `type`, and the two are not interchangeable in the small ways that bite
  // later: an `interface` is open to declaration merging, a `type` is not. Taste a machine can hold.
  { rules: { '@typescript-eslint/consistent-type-definitions': ['error', 'type'] } },
  // One blank line apart at most; a stray second one is noise a diff then carries.
  { rules: { 'no-multiple-empty-lines': ['error', { max: 1 }] } },
  // Process boundaries (app-rule-2). The folder a file sits in says which process runs it, and an
  // import across that line either drags Node into the renderer or the DOM into main. Type imports
  // of a package are erased, so they pass; a type import of another process's file still fails,
  // because the type belongs in src/shared.
  { files: ['src/renderer/**'], rules: restrict([
    { group: ['**/main/**', '**/preload/**'], message: 'The renderer reaches main through the bridge; shared types live in src/shared.' },
    { group: nodeOnly, message: 'Node-only module in the renderer.', allowTypeImports: true },
  ]) },
  { files: ['src/main/**'], rules: restrict([
    { group: ['**/renderer/**'], message: 'Main never imports the renderer; move the type to src/shared.' },
    { group: domOnly, message: 'DOM-only module in main.', allowTypeImports: true },
  ]) },
  { files: ['src/shared/**'], rules: restrict([
    { group: ['**/main/**', '**/renderer/**'], message: 'Shared code imports only shared code.' },
    { group: [...nodeOnly, ...domOnly], message: 'Shared code runs in both processes.', allowTypeImports: true },
  ]) },
);
