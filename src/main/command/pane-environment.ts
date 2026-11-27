import { readFileSync } from 'node:fs';
import path from 'node:path';
import { replaceFileIfChanged } from '../app/replace-file';
import { failureText } from '../../shared/errors/failure';

// What every pane's shell is handed so an agent in it can reach this app: the command files and the
// socket. Built once in main.ts; every pane gets the same object, and the values that are each pane's
// own, DASHBOARD_PANE and DASHBOARD_PANE_PROJECT, are added by withPaneId at its spawn (pane-shells.ts,
// and chat-sessions.ts for a Claude screen).
//
// `buildFolder` is the unpacked .vite/build folder: node is what runs these files, and node cannot read
// one inside an asar, so forge puts them in app.asar.unpacked.

export type PaneCommands = { board: string; session: string; dashboard: string };

export function paneCommands(buildFolder: string): PaneCommands {
  return {
    // DASHBOARD_BOARD, so an agent in any project can move its own card without hand-editing JSON.
    // Run bare, it prints its usage; .dashboard/CLAUDE.md, seeded into every project, points there.
    board: path.join(buildFolder, 'board-cli-entry.js'),
    // DASHBOARD_SESSION, the `session` command, which reaches this app on the socket.
    session: path.join(buildFolder, 'session-cli-entry.js'),
    // DASHBOARD_COMMAND, both of the above behind one entry. The two above stay, since skills and
    // worker hooks call them by name (command-decision-1).
    dashboard: path.join(buildFolder, 'dashboard-cli-entry.js'),
  };
}

// The command files a pane runs, copied out of the build into `folder` (userData's `commands`) at
// launch, so a rebuild, which replaces the build under the running app, leaves them this app's until
// it restarts, and the restart rewrites them in the same place, where a shell the pane host kept
// through it still points (command-decision-12). A copy that fails leaves the panes on the build's
// own files, which a rebuild can still swap; `warn` is told why.
export function keptCommands(buildFolder: string, folder: string, warn: (line: string) => void): PaneCommands {
  const built = paneCommands(buildFolder);
  const kept = paneCommands(folder);
  try {
    // Node reads a .js as ESM under a package.json saying "type": "module" anywhere above it.
    replaceFileIfChanged(path.join(folder, 'package.json'), '{"type":"commonjs"}\n');
    for (const name of Object.keys(kept) as (keyof PaneCommands)[]) replaceFileIfChanged(kept[name], readFileSync(built[name], 'utf8'));
    return kept;
  } catch (error: unknown) {
    warn(`commands not copied to ${folder}, so a rebuild reaches the panes before a restart: ${failureText(error)}`);
    return built;
  }
}

// One pane's environment: the shared one, its own id, which the browser command acts for, and the
// project it is a pane of. A shell the pane host keeps through a restart keeps both, and its id may
// name another pane by then (a project closed before the restart moves the ones after it); the door
// reads the live id off the project and the pane's place in it (browser-requests.ts).
export function withPaneId(shared: Record<string, string>, pane: string, projectPath: string): Record<string, string> {
  return { ...shared, DASHBOARD_PANE: pane, DASHBOARD_PANE_PROJECT: projectPath };
}

// `appExecutable` is what `dashboard` starts when no app answers (start-app.ts), or null for a
// development run, whose executable is Electron's own and opens nothing without the checkout beside it.
export function environmentForPanes(
  environment: NodeJS.ProcessEnv, commands: PaneCommands, socket: string, userData: string, appExecutable: string | null,
): Record<string, string> {
  return {
    ...environment,
    DASHBOARD_COMMAND: commands.dashboard,
    DASHBOARD_BOARD: commands.board,
    DASHBOARD_SESSION: commands.session,
    DASHBOARD_SOCKET: socket,
    // Where session.json and recents.json are, for `dashboard project init` and `list`.
    DASHBOARD_USER_DATA: userData,
    ...(appExecutable === null ? {} : { DASHBOARD_APP: appExecutable }),
  } as Record<string, string>;
}
