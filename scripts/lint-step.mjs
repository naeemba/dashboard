// `pnpm lint`: eslint, then the markdown checks (width, docs ids), both run whichever fails, so one run names every problem.
// Arguments go to eslint (`pnpm lint --fix`).
/* global process, console */
import { ESLINT_FAILED } from './check.mjs';
import { ESLINT, run } from './run-node.mjs';

const linted = run(ESLINT, ['.', ...process.argv.slice(2)]);
if (!linted) console.error(ESLINT_FAILED);
const markdownPassed = run('scripts/markdown-step.mjs');
process.exit(linted && markdownPassed ? 0 : 1);
