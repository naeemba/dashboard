import { resolve } from 'node:path';
import { baseName } from '../../shared/app/base-name';
import { readFlagList } from '../command/flags';
import { wholePath } from '../nvim/file-open';
import { projectNamed } from './project-named';
import { firstProjectsFile } from './projects-first';
import { findProjects, projectsListed, type Project } from './projects-file';
import { realPath as realFolder } from '../app/real-path';
import { addProject, CLEARABLE, removeProject, setProject, type DeployChange, type ProjectChange, type ProjectsWrite } from './projects-write';

// The `project` noun's decisions: which verb, and what it answers given the file's text and, for init,
// the folders the app knows. The files themselves are project-program.ts's to read, so every branch
// here is a test away. open, close and focus are the app's, so they come back as the words to ask it
// with, which project-requests.ts answers in main.

export const PROJECT_USAGE = `project — the projects in ~/.dashboard/projects.yaml

  project list          every project, and every project the app has open, marked open
  project find <word>   the projects whose name or aka match the word, then whose about contains it
  project init          write a first projects.yaml from the open and recent projects, never over one
  project add <path> [--name <n>] [--aka a,b] [--site <url>] [--about "<line>"]
                        list a folder; refused when it is listed already or the name is taken
  project set <name> [--aka a,b] [--site <url>] [--about "<line>"]
                     [--deploy name=<n>,role=<r>,address=<a>]... [--clear <field>]...
                        --aka adds names, --deploy adds or changes one deploy by its name,
                        --site and --about replace, --clear takes aka, site, about or deploy away
  project remove <name> take the project out of the file
  project open <name>   open it in the app, the way the project picker does
  project close <name>  close it, refused while any of its panes is running something
  project focus <name>  bring the app to the front on that project's page

open, close, focus, set and remove take a name or an aka exactly, in any case. add, set and remove
keep the file's comments and order, and the app adds every project it opens that the file lacks.`;

// The word main's socket tells a project request from a session one by. project-requests.ts reads it.
export const PROJECT_REQUEST = 'project';

// The verbs the app answers, over the socket; project-requests.ts reads the same list.
export const APP_VERBS: readonly string[] = ['open', 'close', 'focus'];

// `file` is what to write to the file before printing the output: over the file read when there was
// one, and never over one when there was not (init, or add with no file yet). `ask`, from open close and focus, is what to ask the
// app: [PROJECT_REQUEST, verb, folder, name].
export type ProjectAnswer =
  | { ok: true; output: string; file?: string }
  | { ok: false; message: string }
  | { ok: true; ask: string[] };

// The folders the app had open at its last save and has opened, each one still there; null when the
// app's userData folder, where it keeps them, does not exist: the app has never run as this user.
export type KnownFolders = { open: string[]; recent: string[] } | null;

export const NO_APP_DATA_MESSAGE = 'init reads the open and recent projects from the app\'s userData folder, which does not exist yet; open the app once first';

// `text` is the file's contents, or null when there is no file. `knownFolders` is init's and list's,
// asked for only once nothing refuses. `home` is what a leading ~ means, to every verb that reads a path.
// `realPath` is where a folder really is, for add to find a folder listed under another path.
export function runProjectCommand(
  commandArguments: readonly string[], text: string | null, filePath: string, knownFolders: () => KnownFolders, home: string,
  realPath: (folder: string) => string = realFolder,
): ProjectAnswer {
  const [verb, ...rest] = commandArguments;
  if (verb === 'init') return projectInit(rest, text, knownFolders, home, filePath);
  if (verb === 'add' || verb === 'set' || verb === 'remove') return projectEdit(verb, rest, text, filePath, home, realPath);
  if (verb === undefined || (verb !== 'list' && verb !== 'find' && !APP_VERBS.includes(verb))) {
    return { ok: false, message: verb === undefined ? PROJECT_USAGE : `no such command: ${verb}\n\n${PROJECT_USAGE}` };
  }
  const word = rest.join(' ').trim();
  if (verb !== 'list' && word === '') return { ok: false, message: `${verb} takes a word\n\n${PROJECT_USAGE}` };
  if (verb === 'list' && rest.length > 0) return { ok: false, message: `list takes no words\n\n${PROJECT_USAGE}` };

  if (APP_VERBS.includes(verb)) {
    const named = projectNamed(text, filePath, word, home);
    return named.ok ? { ok: true, ask: [PROJECT_REQUEST, verb, named.path, named.name] } : named;
  }

  const listed = projectsListed(text, filePath);
  // An absent file still leaves the open projects to list; a broken one is refused, or every project
  // in it would vanish and the open ones would read as not in the file.
  if (verb === 'list') return text !== null && !listed.ok ? listed : projectList(listed, knownFolders()?.open ?? [], home, filePath);
  if (!listed.ok) return listed;

  const projects = findProjects(listed.projects, word);
  if (projects.length === 0) return { ok: false, message: `no project matches ${word}` };
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
  if (folders === null) return { ok: false, message: NO_APP_DATA_MESSAGE };
  const { file, count } = firstProjectsFile(initialPaths(folders), home);
  return { ok: true, file, output: `wrote ${filePath} with ${count} project${count === 1 ? '' : 's'}; add aka, site, about and deploy with "dashboard project set" or by hand` };
}

const names = (value: string): string[] => value.split(',').map((each) => each.trim()).filter((each) => each !== '');

// `--deploy name=<n>,role=<r>,address=<a>`: name says which deploy, the others are what changes. An
// address keeps any = after its first.
function deployChange(value: string): DeployChange | string {
  const change: Record<string, string> = {};
  for (const part of value.split(',')) {
    const equals = part.indexOf('=');
    const key = part.slice(0, equals).trim();
    if (equals === -1 || !['name', 'role', 'address'].includes(key)) return `--deploy takes name=<n>,role=<r>,address=<a>, not ${part}`;
    change[key] = part.slice(equals + 1).trim();
  }
  if (!change.name) return '--deploy needs name=<n>, the deploy to add or change';
  return { name: change.name, role: change.role, address: change.address };
}

// The flags set takes, as the change projects-write.ts makes, or why they are refused.
function projectChange(flags: readonly [string, string][]): ProjectChange | string {
  if (flags.length === 0) return `set takes at least one of --aka, --site, --about, --deploy, --clear\n\n${PROJECT_USAGE}`;
  const change: ProjectChange = {};
  for (const [flag, value] of flags) {
    if (flag === 'aka') change.aka = [...(change.aka ?? []), ...names(value)];
    if (flag === 'site') change.site = value;
    if (flag === 'about') change.about = value;
    if (flag === 'clear') {
      if (!CLEARABLE.includes(value)) return `--clear takes ${CLEARABLE.join(', ')}; name and path are required`;
      change.clear = [...(change.clear ?? []), value];
    }
    if (flag === 'deploy') {
      const deploy = deployChange(value);
      if (typeof deploy === 'string') return deploy;
      change.deploy = [...(change.deploy ?? []), deploy];
    }
  }
  return change;
}

// add, set and remove: the first word is the folder or the project, the rest flags. The file written
// is what projects-write.ts answers; nothing is written when it refuses.
function projectEdit(
  verb: 'add' | 'set' | 'remove', words: readonly string[], text: string | null, filePath: string, home: string,
  realPath: (folder: string) => string,
): ProjectAnswer {
  const [target, ...flagWords] = words;
  if (target === undefined || target.startsWith('--')) return { ok: false, message: `${verb} takes ${verb === 'add' ? 'a folder' : 'a name'} first\n\n${PROJECT_USAGE}` };
  if (verb === 'remove' && flagWords.length > 0) return { ok: false, message: `remove takes one name and no flags\n\n${PROJECT_USAGE}` };
  const read = readFlagList(flagWords, verb === 'add' ? ['name', 'aka', 'site', 'about'] : ['aka', 'site', 'about', 'deploy', 'clear']);
  if ('message' in read) return { ok: false, message: read.message };

  let result: ProjectsWrite;
  if (verb === 'remove') result = removeProject(text, filePath, target);
  else if (verb === 'add') {
    const flags = new Map(read.flags);
    // A relative folder is the one the command was run from, the way `cd` would read it.
    const folder = wholePath(target, home) ?? resolve(target);
    const aka = flags.get('aka');
    result = addProject(text, filePath, folder, { name: flags.get('name'), aka: aka === undefined ? undefined : names(aka), site: flags.get('site'), about: flags.get('about') }, home, realPath);
  } else {
    const change = projectChange(read.flags);
    if (typeof change === 'string') return { ok: false, message: change };
    result = setProject(text, filePath, target, change);
  }
  if (!result.ok) return result;
  const done = { add: 'added', set: 'changed', remove: 'removed' }[verb];
  return { ok: true, file: result.text, output: `${done} ${result.name} in ${filePath}` };
}

// `project list`: the file's projects, each marked open when the app had it open at its last save, then
// the open ones the file does not list, under their folder's name. With a project open, an absent file
// still leaves something to list.
function projectList(listed: ReturnType<typeof projectsListed>, open: readonly string[], home: string, filePath: string): ProjectAnswer {
  const fileProjects = (listed.ok ? listed.projects : []).map((project) => ({ project, folder: wholePath(project.path, home) }));
  const listedPaths = new Set(fileProjects.map(({ folder }) => folder));
  const entries = fileProjects.map(({ project, folder }) => {
    const described = describeProject(project);
    return folder !== undefined && open.includes(folder) ? `${described}\n  open` : described;
  });
  for (const folder of open) {
    if (!listedPaths.has(folder)) entries.push(`${baseName(folder)}\n  path: ${folder}\n  open, not in ${filePath}`);
  }
  if (entries.length === 0) return listed.ok ? { ok: false, message: `${filePath} lists no projects` } : listed;
  return { ok: true, output: entries.join('\n\n') };
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
