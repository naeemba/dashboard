import { homedir } from 'node:os';
import { Document, isSeq, parseDocument, visit, type YAMLMap, type YAMLSeq } from 'yaml';
import { realPath as realFolder } from '../app/real-path';
import { replaceFile } from '../app/replace-file';
import { wholePath } from '../nvim/file-open';
import { exactProject } from './project-named';
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

// One deploy as `set --deploy` gives it: the name says which, and only the fields given change.
export type DeployChange = { name: string; role?: string; address?: string };

export type ProjectChange = {
  aka?: string[];
  site?: string;
  about?: string;
  deploy?: DeployChange[];
  clear?: Clearable[];
};

export const CLEARABLE = ['aka', 'site', 'about', 'deploy'] as const;
export type Clearable = (typeof CLEARABLE)[number];

type Opened = { ok: true; document: Document; projects: Project[] } | { ok: false; message: string };

// The file's document and what it lists, or why it cannot be changed. No file is an empty list.
function opened(text: string | null, filePath: string): Opened {
  if (text === null) return { ok: true, document: parseDocument(''), projects: [] };
  const listed = projectsListed(text, filePath);
  if (!listed.ok) return { ok: false, message: `${listed.message}\nnothing was written; fix the file first` };
  const document = parseDocument(text);
  // readProjects takes a number as written, so `name: 0123` is 0123; printed back as the number it
  // parses to, it would be 123, a different name. A number whose text is not how it prints is kept
  // as that text.
  visit(document, {
    Scalar(_key, node) {
      const source = node.range ? text.slice(node.range[0], node.range[1]).trim() : undefined;
      if (typeof node.value === 'number' && source !== undefined && String(node.value) !== source) node.value = source;
    },
  });
  return { ok: true, document, projects: listed.projects };
}

// Flow lists are written `[a, b]`, the way the file's own examples write them, and a long line is
// never folded.
const printed = (document: Document): string => document.toString({ flowCollectionPadding: false, lineWidth: 0 });

// The text once readProjects takes it.
function written(text: string, filePath: string, name: string): ProjectsWrite {
  const read = readProjects(text, filePath);
  return read.ok ? { ok: true, text, name } : { ok: false, message: `${read.problems.join('\n')}\nnothing was written` };
}

// The entries, as nodes; opened has already said the file is a list of maps when it lists anything.
function entries(document: Document): YAMLMap[] {
  if (!isSeq(document.contents)) document.contents = document.createNode([]) as YAMLSeq;
  return (document.contents as YAMLSeq).items as YAMLMap[];
}

// The file opened, and the entry whose name or aka is the word, the way `project open` matches.
function located(text: string | null, filePath: string, word: string): { document: Document; project: Project; index: number } | { ok: false; message: string } {
  const file = opened(text, filePath);
  if (!file.ok) return file;
  const project = exactProject(file.projects, word);
  if (project === undefined) return { ok: false, message: `no project is called ${word}` };
  return { document: file.document, project, index: file.projects.indexOf(project) };
}

// The entry naming the folder. A path written exactly as the folder skips the realpath call, which
// is the common case for an entry the app appended itself.
function listedFolder(projects: readonly Project[], folder: string, home: string, realPath: (folder: string) => string): Project | undefined {
  const real = realPath(folder);
  return projects.find((project) => {
    const whole = wholePath(project.path, home);
    return whole !== undefined && (whole === folder || realPath(whole) === real);
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
  home: string, realPath: (folder: string) => string,
): ProjectsWrite {
  const file = opened(text, filePath);
  if (!file.ok) return file;
  const listed = listedFolder(file.projects, folder, home, realPath);
  if (listed) return { ok: false, message: `${folder} is already listed, as ${listed.name}` };
  // With no name asked for, the folder's name is taken the way withOpenedProject would take it, with
  // -2 after it when another project has it; a name asked for that clashes is readProjects' refusal.
  const taken = new Set(file.projects.flatMap((project) => [project.name, ...project.aka].map((word) => word.toLowerCase())));
  const name = fields.name ?? uniqueName(folder, taken);
  const { document } = file;
  const entry = document.createNode({ name }) as YAMLMap;
  if (fields.aka && fields.aka.length > 0) entry.set('aka', akaList(document, fields.aka));
  entry.set('path', writtenPath(folder, home));
  if (fields.site !== undefined) entry.set('site', fields.site);
  if (fields.about !== undefined) entry.set('about', fields.about);
  // A file that is a block list, or only comments, keeps every byte it had: the entry's own text goes
  // after it. Anything else (a flow list) is reprinted with the entry in it.
  if (text !== null && (document.contents === null || (isSeq(document.contents) && !document.contents.flow))) {
    const single = new Document([]);
    (single.contents as YAMLSeq).items.push(entry);
    const separator = text === '' || text.endsWith('\n') ? '' : '\n';
    return written(text + separator + printed(single), filePath, name);
  }
  entries(document).push(entry);
  return written(printed(document), filePath, name);
}

// `project set`: the clears first, so `--clear deploy --deploy name=...` replaces the list. An aka is
// added beside the ones there, a deploy added or changed by its name, and site and about replaced.
export function setProject(text: string | null, filePath: string, word: string, change: ProjectChange): ProjectsWrite {
  const found = located(text, filePath, word);
  if ('ok' in found) return found;
  const { document, project } = found;
  const entry = entries(document)[found.index];
  for (const field of change.clear ?? []) entry.delete(field);

  const known = new Set<string>(change.clear?.includes('aka') ? [] : project.aka.map((each) => each.toLowerCase()));
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

  if (change.deploy && change.deploy.length > 0) {
    const existing: unknown = entry.get('deploy', true);
    const list = isSeq(existing) ? existing : document.createNode([]) as YAMLSeq;
    if (list !== existing) entry.set('deploy', list);
    // Matched the way the reader reads the names, as written and in any case, index for index with
    // the list's items.
    const deployNames = list === existing ? project.deploy.map((each) => each.name.toLowerCase()) : [];
    for (const deploy of change.deploy) {
      const index = deployNames.indexOf(deploy.name.toLowerCase());
      if (index === -1) {
        list.items.push(document.createNode(deploy));
        deployNames.push(deploy.name.toLowerCase());
      } else {
        const same = list.items[index] as YAMLMap;
        if (deploy.role !== undefined) same.set('role', deploy.role);
        if (deploy.address !== undefined) same.set('address', deploy.address);
      }
    }
  }
  return written(printed(document), filePath, project.name);
}

const joined = (first: string | null | undefined, second: string | null | undefined): string | undefined =>
  [first, second].filter((each) => each).join('\n') || undefined;

// `project remove`: the entry the word names, and nothing else. The parser hangs the comment above an
// entry on that entry, and above the first one that is the file's header, so it moves to the entry
// after it, or to the file's start or end when there is none.
export function removeProject(text: string | null, filePath: string, word: string): ProjectsWrite {
  const found = located(text, filePath, word);
  if ('ok' in found) return found;
  const { document, index } = found;
  const items = entries(document);
  const [removed] = items.splice(index, 1);
  if (removed.commentBefore) {
    const next = items[index];
    if (next !== undefined) {
      next.commentBefore = joined(removed.commentBefore, next.commentBefore);
      next.spaceBefore = next.spaceBefore || removed.spaceBefore;
    } else if (index === 0) document.commentBefore = joined(document.commentBefore, removed.commentBefore) ?? null;
    else document.comment = joined(document.comment, removed.commentBefore) ?? null;
  }
  return written(printed(document), filePath, found.project.name);
}

// The file with an entry appended for a folder the app has opened, or null when there is nothing to
// write: no file (init writes the first one), a file that does not read, or one that lists the folder
// already. The name is the folder's, with -2, -3 after it when a name or aka has it. A listed folder,
// the case on almost every open, is answered from one read, before the document is parsed to edit.
export function withOpenedProject(text: string | null, folder: string, home: string, realPath: (folder: string) => string = realFolder): string | null {
  if (text === null) return null;
  const listed = projectsListed(text, 'projects.yaml');
  if (!listed.ok || listedFolder(listed.projects, folder, home, realPath)) return null;
  const added = addProject(text, 'projects.yaml', folder, {}, home, realPath);
  return added.ok ? added.text : null;
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
