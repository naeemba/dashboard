import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { isMap, isSeq, parseDocument, type Document, type YAMLMap, type YAMLSeq } from 'yaml';
import { replaceFile } from '../app/replace-file';
import { wholePath } from '../nvim/file-open';
import { projectsListed, readProjects, readProjectsFile, type Project } from './projects-file';
import { uniqueName, writtenPath } from './projects-first';

// Every change to ~/.dashboard/projects.yaml after init: `project add`, `set` and `remove`, and the
// entry the app appends for a project it opens that the file does not list. Each edits the file's
// own parsed document rather than writing it out fresh, so the owner's comments, blank lines and
// entry order stay where they were. A file that does not read cleanly is refused, never edited: a
// change would bury the problem under a second one. The text a change makes is read back through
// readProjects before anything is written, so a change the reader would refuse (a name another
// project has, a deploy with no address, two lines in an about) is refused here with its message.

// `name` is the entry's name once changed, for the command to say which project it changed.
export type ProjectsWrite = { ok: true; text: string; name: string } | { ok: false; message: string };

// Where a folder really is, so a project opened through a symlink is the entry that names the
// folder by its other path. A folder that is not there is compared as written.
export function realFolder(folder: string): string {
  try {
    return realpathSync(folder);
  } catch {
    return folder;
  }
}

// One deploy as `set --deploy` gives it: the name says which, and only the fields given change.
export type DeployChange = { name: string; role?: string; address?: string };

export type ProjectChange = {
  aka?: string[];
  site?: string;
  about?: string;
  deploy?: DeployChange[];
  clear?: string[];
};

export const CLEARABLE = ['aka', 'site', 'about', 'deploy'];

type Opened = { ok: true; document: Document; projects: Project[] } | { ok: false; message: string };

// The file's document and what it lists, or why it cannot be changed. No file is an empty list.
function opened(text: string | null, filePath: string): Opened {
  if (text === null) return { ok: true, document: parseDocument(''), projects: [] };
  const listed = projectsListed(text, filePath);
  if (!listed.ok) return { ok: false, message: `${listed.message}\nnothing was written; fix the file first` };
  return { ok: true, document: parseDocument(text), projects: listed.projects };
}

// The document's text once readProjects takes it. Flow lists are written `[a, b]`, the way the
// file's own examples write them.
function written(document: Document, filePath: string, name: string): ProjectsWrite {
  const text = document.toString({ flowCollectionPadding: false });
  const read = readProjects(text, filePath);
  return read.ok ? { ok: true, text, name } : { ok: false, message: `${read.problems.join('\n')}\nnothing was written` };
}

// The entries, as nodes; opened has already said the file is a list of maps when it lists anything.
function entries(document: Document): YAMLMap[] {
  if (!isSeq(document.contents)) document.contents = document.createNode([]) as YAMLSeq;
  return (document.contents as YAMLSeq).items as YAMLMap[];
}

// The entry whose name or aka is the word, in any case, the way projectNamed matches.
function entryIndex(projects: readonly Project[], word: string): number {
  const wanted = word.trim().toLowerCase();
  return projects.findIndex((project) => [project.name, ...project.aka].some((each) => each.toLowerCase() === wanted));
}

function listedFolder(projects: readonly Project[], folder: string, home: string, realPath: (folder: string) => string): Project | undefined {
  const real = realPath(folder);
  return projects.find((project) => {
    const whole = wholePath(project.path, home);
    return whole !== undefined && realPath(whole) === real;
  });
}

function akaList(document: Document, aka: readonly string[]): YAMLSeq {
  const list = document.createNode(aka) as YAMLSeq;
  list.flow = true;
  return list;
}

// `project add`: a new entry at the end for an absolute folder. Refused when the file already lists
// the folder, under whatever path; a name or aka another project has is readProjects' refusal.
export function addProject(
  text: string | null, filePath: string, folder: string, fields: { name?: string; aka?: string[]; site?: string; about?: string },
  home: string, realPath: (folder: string) => string = realFolder,
): ProjectsWrite {
  const file = opened(text, filePath);
  if (!file.ok) return file;
  const listed = listedFolder(file.projects, folder, home, realPath);
  if (listed) return { ok: false, message: `${folder} is already listed, as ${listed.name}` };
  const name = fields.name ?? uniqueName(folder, new Set());
  const { document } = file;
  const entry = document.createNode({ name }) as YAMLMap;
  if (fields.aka && fields.aka.length > 0) entry.set('aka', akaList(document, fields.aka));
  entry.set('path', writtenPath(folder, home));
  if (fields.site !== undefined) entry.set('site', fields.site);
  if (fields.about !== undefined) entry.set('about', fields.about);
  entries(document).push(entry);
  return written(document, filePath, name);
}

// `project set`: the clears first, so `--clear deploy --deploy name=...` replaces the list. An aka is
// added beside the ones there, a deploy added or changed by its name, and site and about replaced.
export function setProject(text: string | null, filePath: string, word: string, change: ProjectChange): ProjectsWrite {
  const file = opened(text, filePath);
  if (!file.ok) return file;
  const index = entryIndex(file.projects, word);
  if (index === -1) return { ok: false, message: `no project is called ${word}` };
  const { document } = file;
  const entry = entries(document)[index];
  for (const field of change.clear ?? []) entry.delete(field);

  const known = new Set(change.clear?.includes('aka') ? [] : file.projects[index].aka.map((each) => each.toLowerCase()));
  const addedAka: string[] = [];
  for (const each of change.aka ?? []) {
    if (known.has(each.toLowerCase())) continue;
    known.add(each.toLowerCase());
    addedAka.push(each);
  }
  const aka = entry.get('aka', true);
  if (isSeq(aka)) aka.items.push(...addedAka.map((each) => document.createNode(each)));
  else if (addedAka.length > 0) entry.set('aka', akaList(document, addedAka));
  if (change.site !== undefined) entry.set('site', change.site);
  if (change.about !== undefined) entry.set('about', change.about);

  for (const deploy of change.deploy ?? []) {
    const existing: unknown = entry.get('deploy', true);
    const list = isSeq(existing) ? existing : document.createNode([]) as YAMLSeq;
    if (list !== existing) entry.set('deploy', list);
    const items = list.items;
    const same = items.find((item): item is YAMLMap => isMap(item) && String(item.get('name')) === deploy.name);
    if (same === undefined) {
      items.push(document.createNode(deploy));
      continue;
    }
    if (deploy.role !== undefined) same.set('role', deploy.role);
    if (deploy.address !== undefined) same.set('address', deploy.address);
  }
  return written(document, filePath, file.projects[index].name);
}

// `project remove`: the entry the word names, and nothing else.
export function removeProject(text: string | null, filePath: string, word: string): ProjectsWrite {
  const file = opened(text, filePath);
  if (!file.ok) return file;
  const index = entryIndex(file.projects, word);
  if (index === -1) return { ok: false, message: `no project is called ${word}` };
  entries(file.document).splice(index, 1);
  return written(file.document, filePath, file.projects[index].name);
}

// The file with an entry appended for a folder the app has opened, or null when there is nothing to
// write: no file (init writes the first one), a file that does not read, or one that lists the folder
// already. The name is the folder's, with -2, -3 after it when a name or aka has it.
export function withOpenedProject(text: string | null, folder: string, home: string, realPath: (folder: string) => string = realFolder): string | null {
  if (text === null) return null;
  const file = opened(text, 'projects.yaml');
  if (!file.ok || listedFolder(file.projects, folder, home, realPath)) return null;
  const taken = new Set(file.projects.flatMap((project) => [project.name, ...project.aka].map((word) => word.toLowerCase())));
  const name = uniqueName(folder, taken);
  entries(file.document).push(file.document.createNode({ name, path: writtenPath(folder, home) }));
  const changed = written(file.document, 'projects.yaml', name);
  return changed.ok ? changed.text : null;
}

// What main runs on every open. Like the recents history, the file is a convenience here: a write
// that fails must not fail the open, so it is skipped and tried again on the next one.
// ponytail: read-then-replace with no lock, so a `project set` landing in the same instant can lose
// one of the two changes; a lock file if that is ever seen.
export function listOpenedProject(folder: string): void {
  try {
    const { text, filePath } = readProjectsFile();
    const changed = withOpenedProject(text, folder, homedir());
    if (changed !== null) replaceFile(filePath, changed);
  } catch {
    // Not listed this time.
  }
}
