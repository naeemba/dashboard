import { spawn } from 'node:child_process';

// Starts the app detached from the command, so it outlives the terminal the command ran in. Where the
// app is comes from DASHBOARD_APP: the `dashboard` launcher rebuild.sh installs sets it, and so does
// every pane of an installed app. Unset — a development run, or `node` run on the entry by hand — this
// answers null and the command says to start the app itself.
//
// A second copy is harmless: the single-instance lock (launch-gate.ts, app-decision-1) hands its
// arguments to the running app, which comes to the front, and the copy exits.
export function appStarter(environment: NodeJS.ProcessEnv): ((appArguments?: readonly string[]) => void) | null {
  const executable = environment.DASHBOARD_APP;
  if (!executable) return null;
  return (appArguments = []) => {
    spawn(executable, [...appArguments], { detached: true, stdio: 'ignore' }).unref();
  };
}
