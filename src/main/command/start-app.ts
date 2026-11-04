import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';

// Starts the app detached from the command, so it outlives the terminal the command ran in. Where the
// app is comes from DASHBOARD_APP: the `dashboard` launcher rebuild.sh installs sets it, and so does
// every pane of an installed app. Unset, or naming a file that is gone, this answers null and
// appStartRefusal says why.
//
// A second copy is harmless: the single-instance lock (launch-gate.ts, app-decision-1) hands its
// arguments to the running app, which comes to the front, and the copy exits.
export function appStarter(environment: NodeJS.ProcessEnv, exists: (file: string) => boolean = existsSync): ((appArguments?: readonly string[]) => void) | null {
  const executable = environment.DASHBOARD_APP;
  if (executable === undefined || appStartRefusal(executable, exists) !== null) return null;
  return (appArguments = []) => {
    const child = spawn(executable, appLaunchArguments(environment, appArguments), { detached: true, stdio: 'ignore', env: appEnvironment(environment), cwd: homedir() });
    // Gone between the check and the spawn ends in the command's own line (no app answered), not a throw.
    child.on('error', () => undefined);
    child.unref();
  };
}

// A pane of a copy started with --user-data-dir names that copy's folder in DASHBOARD_USER_DATA, and the
// command waits for the socket pointer there (app-address.ts). The app it starts has to open on the same
// folder, or it writes its pointer somewhere the command never looks. An installed app's own panes name
// its default folder, so for them this changes nothing.
export function appLaunchArguments(environment: NodeJS.ProcessEnv, appArguments: readonly string[]): string[] {
  const userData = environment.DASHBOARD_USER_DATA;
  return userData ? [`--user-data-dir=${userData}`, ...appArguments] : [...appArguments];
}

// Why the app cannot be started, or null.
export function appStartRefusal(executable: string | undefined, exists: (file: string) => boolean): string | null {
  if (!executable) return 'DASHBOARD_APP is not set, so this command does not know where the app is — run the `dashboard` launcher rebuild.sh installs';
  if (!exists(executable)) return `${executable} does not exist — rebuild and reinstall the app with rebuild.sh`;
  return null;
}

// The caller's environment without what belongs to the caller: the app hands its environment to every
// pane, so a Claude session's own id and messaging token would make every session the app starts look
// started from inside that one, and those sessions are not saved. The pane variables are the app's to set.
export function appEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(environment).filter(([name]) =>
    name !== 'CLAUDECODE' && name !== 'CLAUDE_PID' && !name.startsWith('CLAUDE_CODE_') && !name.startsWith('DASHBOARD_')));
}
