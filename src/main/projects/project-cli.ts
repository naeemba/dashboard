import { projectNamed } from './project-named';
import { firstProjectsFile } from './projects-first';
import { findProjects, projectsListed, type Project } from './projects-file';

// The `project` noun's decisions: which verb, and what it answers given the file's text and, for init,
// the folders the app knows. The files themselves are project-program.ts's to read, so every branch
// here is a test away. open and close are the app's, so they come back as the words to ask it with,
// which project-requests.ts answers in main.

export const PROJECT_USAGE = `project — the projects in ~/.dashboard/projects.yaml

  project list          every project
  project find <word>   the projects whose name or aka match the word, then whose about contains it
  project init          write a first projects.yaml from the open and recent projects, never over one
  project open <name>   open it in the app, the way the project picker does
  project close <name>  close it, refused while any of its panes is running something

open and close take a name or an aka exactly, in any case.`;

// The word main's socket tells a project request from a session one by. project-requests.ts reads it.
export const PROJECT_REQUEST = 'project';

// `file`, from init alone, is what to write to the file before printing the output. `ask`, from open
// and close, is what to ask the app: [PROJECT_REQUEST, verb, folder, name].
export type ProjectAnswer =
  | { ok: true; output: string; file?: string }
  | { ok: false; message: string }
  | { ok: true; ask: string[] };

// The folders the app has open and has opened, each one still there; null outside a pane, where
// DASHBOARD_USER_DATA, the folder the app keeps them in, is not set.
export type KnownFolders = { open: string[]; recent: string[] } | null;

export const OUTSIDE_PANE_MESSAGE = 'init reads the open and recent projects from DASHBOARD_USER_DATA, which only a dashboard pane carries; run it from a pane';

// `text` is the file's contents, or null when there is no file. `knownFolders` is init's alone, and
// is asked for only once nothing refuses. `home` is what a leading ~ means, to init and to open and close.
export function runProjectCommand(commandArguments: readonly string[], text: string | null, filePath: string, knownFolders: () => KnownFolders, home: string): ProjectAnswer {
  const [verb, ...rest] = commandArguments;
  if (verb === 'init') return projectInit(rest, text, knownFolders, home, filePath);
  if (verb !== 'list' && verb !== 'find' && verb !== 'open' && verb !== 'close') {
    return { ok: false, message: verb === undefined ? PROJECT_USAGE : `no such command: ${verb}\n\n${PROJECT_USAGE}` };
  }
  const word = rest.join(' ').trim();
  if (verb !== 'list' && word === '') return { ok: false, message: `${verb} takes a word\n\n${PROJECT_USAGE}` };
  if (verb === 'list' && rest.length > 0) return { ok: false, message: `list takes no words\n\n${PROJECT_USAGE}` };

  if (verb === 'open' || verb === 'close') {
    const named = projectNamed(text, filePath, word, home);
    return named.ok ? { ok: true, ask: [PROJECT_REQUEST, verb, named.path, named.name] } : named;
  }

  const listed = projectsListed(text, filePath);
  if (!listed.ok) return listed;

  const projects = verb === 'find' ? findProjects(listed.projects, word) : listed.projects;
  if (projects.length === 0) return { ok: false, message: verb === 'find' ? `no project matches ${word}` : `${filePath} lists no projects` };
  return { ok: true, output: projects.map(describeProject).join('\n\n') };
}

// The order init lists the known folders in: the open ones first, then the recent ones.
export function initialPaths(folders: { open: string[]; recent: string[] }): string[] {
  return [...folders.open, ...folders.recent];
}

// `project init`, the one verb that writes: what it writes, given the words after init and the file's
// text (null when there is none). Refused, never overwritten, when the file is there, and refused
// outside a pane, where writing a file with no projects would only block the init run from a pane.
// project-program.ts writes `file`.
function projectInit(words: readonly string[], text: string | null, knownFolders: () => KnownFolders, home: string, filePath: string): ProjectAnswer {
  if (words.length > 0) return { ok: false, message: `init takes no words\n\n${PROJECT_USAGE}` };
  if (text !== null) return { ok: false, message: `${filePath} already exists; init never overwrites it` };
  const folders = knownFolders();
  if (folders === null) return { ok: false, message: OUTSIDE_PANE_MESSAGE };
  const { file, count } = firstProjectsFile(initialPaths(folders), home);
  return { ok: true, file, output: `wrote ${filePath} with ${count} project${count === 1 ? '' : 's'}; add aka, site, about and deploy by hand` };
}

// How a project reads in the command's output: a heading line, then one indented line per field it has.
export function describeProject(project: Project): string {
  const lines = [project.aka.length > 0 ? `${project.name} (aka ${project.aka.join(', ')})` : project.name];
  lines.push(`  path: ${project.path}`);
  if (project.site !== '') lines.push(`  site: ${project.site}`);
  if (project.about !== '') lines.push(`  about: ${project.about}`);
  for (const each of project.deploy) lines.push(`  deploy ${each.role}: ${each.name} ${each.address}`);
  return lines.join('\n');
}
