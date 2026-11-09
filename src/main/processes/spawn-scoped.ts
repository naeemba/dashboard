import { spawn, type SpawnOptions } from 'node:child_process';
import type { ScopedCommand } from './scope';

// The one door a long-running process the app starts without a pty goes through: a command already
// put in its scope (scope-support.ts), or left as it was when there is none. The manager's tasks and
// the Agent SDK's Claude (agent-spawn.ts) start here, so neither names child_process itself
// (processes-rule-1).
export function spawnScoped(command: Pick<ScopedCommand, 'file' | 'args'>, options: SpawnOptions) {
  return spawn(command.file, command.args, options);
}
