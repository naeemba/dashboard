import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['.vite/', 'dist/', 'out/'] },
  eslint.configs.recommended,
  tseslint.configs.recommended,
);
