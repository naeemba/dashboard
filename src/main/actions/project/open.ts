import { failureText } from '../../../shared/errors/failure';
import { action } from '../action';
import { isFilledText } from '../pane/pane-input';

// A project opened from its path: by the picker (its folder dialog and path check are the picker's
// door's, in project-actions.ts), by `pane claim --project`, and by `dashboard project open`. Every one
// comes here, so every way in waits for the hosts, refuses a folder that is not there, opens over a
// dead page and starts its shells, watches its board and remembers it alike (main's `place`).

export type ProjectOpenFrom = 'picker' | 'claim' | 'command';

const FROMS: readonly ProjectOpenFrom[] = ['picker', 'claim', 'command'];

export type ProjectOpenInput = { projectPath: string; name: string; from: ProjectOpenFrom };

export type ProjectOpenPorts = {
  // The pane host and the screen host have said what they kept. One opened before would start fresh
  // shells in panes that already have one, and count a worker screen still running as done.
  ready(): Promise<void>;
  // The slot a project folder is open in, or -1.
  slotOf(projectPath: string): number;
  // Whether the project in that slot was restored with its folder gone: a dead page, not an open one.
  missingIn(slot: number): boolean;
  folderExists(projectPath: string): boolean;
  // The project opened unless it is open already, a dead page opened over, a page on every screen.
  // Answers its slot.
  place(projectPath: string): number;
  // Starts the page's main session if it is not running, and answers its name once it has initialised,
  // which is when another session's SendMessage can reach it.
  startMain(slot: number): Promise<string>;
};

// How long `project open` waits for main to answer. Claude Code takes a few seconds to start; a minute
// is long enough for a slow machine and short enough that a session stuck starting is said out loud.
export const MAIN_START_MS = 60_000;

async function startedMain(ports: ProjectOpenPorts, slot: number, opened: string): Promise<{ output: string; index: number } | { refused: string }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`nothing answered within ${MAIN_START_MS / 1000} seconds`)), MAIN_START_MS);
  });
  try {
    return { output: `${opened}; ${await Promise.race([ports.startMain(slot), timeout])} is running`, index: slot };
  } catch (error) {
    return { refused: `${opened}, but its main session did not start: ${failureText(error)}` };
  } finally {
    clearTimeout(timer);
  }
}

function read(raw: Record<string, unknown>): ProjectOpenInput | null {
  const { projectPath, name, from } = raw;
  if (!isFilledText(projectPath) || !isFilledText(name) || !FROMS.includes(from as ProjectOpenFrom)) return null;
  return { projectPath, name, from: from as ProjectOpenFrom };
}

export const projectOpen = action<ProjectOpenPorts, ProjectOpenInput, { output: string; index: number }>('project.open', {
  words: [],
  input: (raw) => read(raw) ?? { refused: 'the project to open was not one the app could read' },
  async run(ports, { projectPath, name, from }) {
    await ports.ready();
    const slot = ports.slotOf(projectPath);
    const live = slot !== -1 && !ports.missingIn(slot);
    // Opened anyway, it would be a dead page reading Directory not found. A dead page whose folder is
    // still gone is refused the same way: answering "already open" would leave it dead and say it worked.
    if (!live && !ports.folderExists(projectPath)) return { refused: `${name}'s folder, ${projectPath}, does not exist` };
    const index = ports.place(projectPath);
    const opened = live ? `${name} is already open` : `opened ${name}`;
    // Only the command starts main with the page, so the manager can hand the project to it at once.
    // The picker's page and a claim's leave it to wait to be shown, told something, or reported to
    // (chat-start.ts), as a page restored at launch does.
    return from === 'command' ? startedMain(ports, index, opened) : { output: opened, index };
  },
});
