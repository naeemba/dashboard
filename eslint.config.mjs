import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['.vite/', 'dist/', 'out/'] },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  // Every shape in src/ is a `type`, and the two are not interchangeable in the small ways that bite
  // later: an `interface` is open to declaration merging, a `type` is not. Taste a machine can hold.
  { rules: { '@typescript-eslint/consistent-type-definitions': ['error', 'type'] } },
);
