import path from 'node:path';

// What every pane's shell is handed so an agent in it can reach this app: the command files and the
// socket. Built once in main.ts; every pane gets the same object, since cloning the whole environment
// per pane is a clone per pane opened for a value that never changes.
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
