import { wholePath } from '../nvim/file-open';
import { findProjects, readProjects, type Project } from './projects-file';

// The `project` noun's decisions: which verb, and what it answers given the file's text. The file
// itself is project-program.ts's to read, so every branch here is a test away. list and find are
// answered from the file alone; open and close are the app's, so they come back as the words to ask
// it with, which project-requests.ts answers in main.

export const PROJECT_USAGE = `project — the projects in ~/.dashboard/projects.yaml

  project list           every project
  project find <word>    the projects whose name or aka match the word, then whose about contains it
  project open <name>    open it in the app, the way the project picker does
  project close <name>   close it, refused while any of its panes is running something

open and close take a name or an aka exactly, in any case.`;

// The word main's socket tells a project request from a session one by. project-requests.ts reads it.
export const PROJECT_REQUEST = 'project';

export type ProjectAnswer =
  | { ok: true; output: string }
  | { ok: false; message: string }
  // What to ask the app: [PROJECT_REQUEST, verb, folder, name].
  | { ok: true; ask: string[] };

// `text` is the file's contents, or null when there is no file. `home` is what a leading ~ means.
export function runProjectCommand(commandArguments: readonly string[], text: string | null, filePath: string, home: string): ProjectAnswer {
  const [verb, ...rest] = commandArguments;
  if (verb !== 'list' && verb !== 'find' && verb !== 'open' && verb !== 'close') {
    return { ok: false, message: verb === undefined ? PROJECT_USAGE : `no such command: ${verb}\n\n${PROJECT_USAGE}` };
  }
  const word = rest.join(' ').trim();
  if (verb !== 'list' && word === '') return { ok: false, message: `${verb} takes a word\n\n${PROJECT_USAGE}` };
  if (verb === 'list' && rest.length > 0) return { ok: false, message: `list takes no words\n\n${PROJECT_USAGE}` };

  if (text === null) return { ok: false, message: `${filePath} does not exist yet; write one, a list of projects with a name and a path each` };
  const read = readProjects(text, filePath);
  if (!read.ok) return { ok: false, message: read.problems.join('\n') };

  if (verb === 'open' || verb === 'close') {
    const named = namedProject(read.projects, word);
    if (typeof named === 'string') return { ok: false, message: named };
    const folder = wholePath(named.path, home);
    if (folder === undefined) return { ok: false, message: `${named.name}'s path, ${named.path}, must start with / or ~` };
    return { ok: true, ask: [PROJECT_REQUEST, verb, folder, named.name] };
  }

  const projects = verb === 'find' ? findProjects(read.projects, word) : read.projects;
  if (projects.length === 0) return { ok: false, message: verb === 'find' ? `no project matches ${word}` : `${filePath} lists no projects` };
  return { ok: true, output: projects.map(describeProject).join('\n\n') };
}

// The one project a word names, or why there is none. Exact, unlike find: open and close act, and a
// fuzzy match would close `api` when you typed `app`. readProjects already refuses two projects
// sharing a word in any case, so an exact match is never ambiguous; a word that only comes close is
// refused with what it came close to, so the next try is a copy away.
export function namedProject(projects: readonly Project[], word: string): Project | string {
  const key = word.toLowerCase();
  const exact = projects.find((project) => [project.name, ...project.aka].some((each) => each.toLowerCase() === key));
  if (exact) return exact;
  const near = findProjects(projects, word).map((project) => project.name);
  return near.length === 0 ? `no project is named ${word}` : `no project is named ${word} — did you mean ${near.join(', ')}?`;
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
