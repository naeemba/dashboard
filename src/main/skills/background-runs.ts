import { LONGEST_BACKGROUND_RUN } from '../ship/review';

// Said by the work-card and dashboard-browser skills: left at the 30-minute background default, a dev
// server died mid-session and checks were killed (retro 2026-11-28).
export const LONG_RUNS = 'A dev server, or a check that can run past two minutes, goes in the background'
  + ` (${LONGEST_BACKGROUND_RUN}): left to the default, it is killed at 30 minutes. After a notice that`
  + ' one stopped at its time limit, read its output file before running it again.';
