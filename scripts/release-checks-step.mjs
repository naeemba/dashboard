// scripts/release.sh's way into release-checks.mjs. Prints the answer on stdout.
//
//   node scripts/release-checks-step.mjs main <bump|resume> <branch> <clean|dirty> <same|behind|other>
//       prints why main cannot be released from, or nothing
//   node scripts/release-checks-step.mjs after-watch <status> [conclusion]
//       prints watch, install or failed
/* global process, console */
import { afterWatch, mainRefusal } from './release-checks.mjs';

const [step, ...rest] = process.argv.slice(2);
if (step === 'main' && rest.length === 4) {
  process.stdout.write(mainRefusal(...rest));
} else if (step === 'after-watch' && (rest.length === 1 || rest.length === 2)) {
  process.stdout.write(afterWatch(...rest));
} else {
  console.error('Usage: release-checks-step.mjs main <bump|resume> <branch> <clean|dirty> <same|behind|other> | after-watch <status> [conclusion]');
  process.exit(1);
}
