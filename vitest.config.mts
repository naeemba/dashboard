import { defineConfig } from 'vitest/config';

// `pnpm check` sets CHECK_COVERAGE to `{ include, reportsDirectory }`: the files the branch changed and
// a folder for the json-summary it reads (scripts/coverage.mjs). A plain `pnpm test` runs without it.
const coverage = process.env.CHECK_COVERAGE;

export default defineConfig({
  test: {
    globalSetup: ['./vitest.temporary-folder-guard.ts'],
    ...(coverage && { coverage: { enabled: true, reporter: ['json-summary'], reportOnFailure: true, ...JSON.parse(coverage) } }),
  },
});
