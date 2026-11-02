import { runCreateTask } from './create-task-program';

// The file the app installs as ~/.claude/skills/create-task/create-task.js (create-task-install.ts), run
// by the /create-task skill and by claude-pr-loop through PR_LOOP_CARD_SCRIPT.
process.exitCode = runCreateTask(process.argv.slice(2), process.cwd());
