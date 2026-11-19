// What the lint and pre-commit entries share: eslint's script, and running a node script with the
// terminal attached, answering whether it passed.
/* global process */
import { spawnSync } from 'node:child_process';

export const ESLINT = 'node_modules/eslint/bin/eslint.js';

export const run = (script, args = []) =>
  spawnSync(process.execPath, [script, ...args], { stdio: 'inherit' }).status === 0;

export const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;
