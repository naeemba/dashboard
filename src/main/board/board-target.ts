import type { ProjectNamed } from '../projects/project-named';
import { homeDirectoryRefusal } from './board-cli';

// Which project's board a `board` command works on. The folder it was run in, or the project above it
// that has a board or a repository (projectRoot), unless --project names one from
// ~/.dashboard/projects.yaml. Neither is ever guessed: a folder in no project is refused, and so is a
// name that is not exactly a project's name or aka (projectNamed). --project and its word may stand
// anywhere in the words; the rest go to the board's own parser untouched.

export type BoardTarget = { ok: true; project: string; commandArguments: string[] } | { ok: false; message: string };

export type BoardTargetPorts = {
  isHome(directory: string): boolean;
  projectRoot(directory: string): string | null;
  named(word: string): ProjectNamed;
};

export function boardTarget(commandArguments: readonly string[], directory: string, ports: BoardTargetPorts): BoardTarget {
  const at = commandArguments.indexOf('--project');
  if (at !== -1) {
    const word = commandArguments[at + 1];
    if (word === undefined || word.startsWith('--')) return { ok: false, message: '--project needs a project\'s name or aka from ~/.dashboard/projects.yaml' };
    const found = ports.named(word);
    if (!found.ok) return found;
    return { ok: true, project: found.path, commandArguments: commandArguments.filter((_, index) => index !== at && index !== at + 1) };
  }
  if (ports.isHome(directory)) return { ok: false, message: homeDirectoryRefusal() };
  const project = ports.projectRoot(directory);
  if (project === null) {
    return { ok: false, message: `${directory} is in no project: no .dashboard or git repository above it — cd into one, or pass --project <name>` };
  }
  return { ok: true, project, commandArguments: [...commandArguments] };
}
