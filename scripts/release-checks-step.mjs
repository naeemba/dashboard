// scripts/release.sh's way into release-checks.mjs. Prints the answer on stdout; the usage line below
// is the argument list.
/* global process, console */
import { mainRefusal, runOutcome } from './release-checks.mjs';

const [step, ...rest] = process.argv.slice(2);
if (step === 'main' && rest.length === 4) {
  process.stdout.write(mainRefusal(...rest));
} else if (step === 'run' && rest.length === 1) {
  process.stdout.write(runOutcome(JSON.parse(rest[0])));
} else {
  console.error('Usage: release-checks-step.mjs main <bump|resume> <branch> <clean|dirty> <same|behind|other> | run <gh status,conclusion json>');
  process.exit(1);
}
