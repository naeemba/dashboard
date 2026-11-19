// `pnpm lint`: eslint, then the markdown width, both run whichever fails, so one run names every problem.
// Arguments go to eslint (`pnpm lint --fix`).
/* global process */
import { ESLINT, run } from './run-node.mjs';

const linted = run(ESLINT, ['.', ...process.argv.slice(2)]);
const wrapped = run('scripts/markdown-width-step.mjs');
process.exit(linted && wrapped ? 0 : 1);
