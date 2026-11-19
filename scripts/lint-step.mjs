// `pnpm lint`: eslint, then the markdown width, both run whichever fails, so one run names every problem.
// Arguments go to eslint (`pnpm lint --fix`).
/* global process */
import { spawnSync } from 'node:child_process';

const run = (args) => spawnSync(process.execPath, args, { stdio: 'inherit' }).status === 0;
const linted = run(['node_modules/eslint/bin/eslint.js', '.', ...process.argv.slice(2)]);
const wrapped = run(['scripts/markdown-width-step.mjs']);
process.exit(linted && wrapped ? 0 : 1);
