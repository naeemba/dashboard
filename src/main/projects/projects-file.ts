import { isMap, isScalar, isSeq, LineCounter, parseDocument, type Node } from 'yaml';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { ranked } from '../../shared/app/fuzzy';
import { BOARD_DIRECTORY } from '../board/board-store';

// ~/.dashboard/projects.yaml: every project the manager can be asked about, one entry each, written
// by hand. Read here, and only here, into Project values; the `project` command and whatever opens a
// project by name later both start from readProjects.
//
// The file is a list:
//
//   - name: new-crm
//     aka: [crm]
//     path: ~/Workspace/new-crm
//     site: https://crm.example.com
//     about: The sales team's CRM
//     deploy:
//       - name: new-raxel
//         role: test
//         address: https://test.example.com
//
// name and path are required, the rest optional. A key the reader does not know is a problem rather
// than ignored, so a misspelt `alias:` is said out loud instead of quietly matching nothing.

export type Deploy = { name: string; role: string; address: string };

export type Project = {
  name: string;
  aka: string[];
  path: string;
  site: string;
  about: string;
  deploy: Deploy[];
};

export type ProjectsRead = { ok: true; projects: Project[] } | { ok: false; problems: string[] };

const PROJECT_KEYS = ['name', 'aka', 'path', 'site', 'about', 'deploy'];
const DEPLOY_KEYS = ['name', 'role', 'address'];

type Fields = Map<string, { value: unknown; line: number }>;

// Every problem in the file, each on its own line and each naming its line, so one pass fixes them
// all: `projects.yaml:4: aka must be a list of names`.
export function readProjects(text: string, fileName = 'projects.yaml'): ProjectsRead {
  const lineCounter = new LineCounter();
  const document = parseDocument(text, { lineCounter });
  const problems: string[] = [];
  const lineOf = (node: unknown): number => lineCounter.linePos((node as Node | null)?.range?.[0] ?? 0).line;
  const problem = (line: number, message: string): void => { problems.push(`${fileName}:${line}: ${message}`); };

  if (document.errors.length > 0) {
    for (const error of document.errors) problem(error.linePos?.[0].line ?? 1, error.message.split('\n')[0]);
    return { ok: false, problems };
  }

  const root = document.contents;
  if (root === null) return { ok: true, projects: [] };
  if (!isSeq(root)) {
    problem(lineOf(root), 'the file must be a list of projects, each starting with "- name:"');
    return { ok: false, problems };
  }

  // A key written with nothing after it (`site:`, `site: ~`) parses as a scalar holding null, and
  // reads the same as a key left out.
  const isEmpty = (value: unknown): boolean => value == null || (isScalar(value) && value.value === null);

  // A text field: absent is '', anything but a plain value on one line is a problem and null. A
  // number is taken as written, so `name: 0123` stays 0123 instead of becoming 123.
  const oneLine = (value: unknown, key: string, line: number): string | null => {
    if (isEmpty(value)) return '';
    // Trimmed before the check: a `>` or `|` block keeps its trailing newline even on one line.
    const written = isScalar(value) && typeof value.value === 'string' ? value.value.trim() : null;
    if (written !== null && !written.includes('\n')) return written;
    if (isScalar(value) && typeof value.value === 'number' && value.range) return text.slice(value.range[0], value.range[1]).trim();
    problem(line, `${key} must be one line of text`);
    return null;
  };

  // Each field's own line where it has one, the entry's otherwise.
  const fields = (node: unknown, known: string[], what: string): Fields | null => {
    if (!isMap(node)) {
      problem(lineOf(node), `each ${what} must be a set of "key: value" lines`);
      return null;
    }
    const found: Fields = new Map();
    for (const pair of node.items) {
      const key = isScalar(pair.key) ? String(pair.key.value) : '';
      const line = lineOf(pair.key);
      if (!known.includes(key)) problem(line, `${what} has no field "${key}" (it takes ${known.join(', ')})`);
      else found.set(key, { value: pair.value, line });
    }
    return found;
  };

  // null when the value was the wrong kind, already said, so required does not also say it is missing.
  const optional = (found: Fields, key: string): string | null => {
    const field = found.get(key);
    return field ? oneLine(field.value, key, field.line) : '';
  };

  const required = (found: Fields, key: string, entryLine: number, what: string): string => {
    const value = optional(found, key);
    if (value === '') problem(found.get(key)?.line ?? entryLine, `${what} has no ${key}`);
    return value ?? '';
  };

  // An optional list: each item through `each`, anything but a list one problem on the field's line.
  const list = <T>(found: Fields, key: string, notAList: string, each: (item: unknown) => T | null): T[] => {
    const field = found.get(key);
    if (field == null || isEmpty(field.value)) return [];
    if (!isSeq(field.value)) {
      problem(field.line, notAList);
      return [];
    }
    return field.value.items.map(each).filter((item): item is T => item !== null);
  };

  const projects: Project[] = [];
  const owner = new Map<string, { project: string; line: number }>();
  for (const entry of root.items) {
    const entryLine = lineOf(entry);
    const found = fields(entry, PROJECT_KEYS, 'project');
    if (found === null) continue;
    const name = required(found, 'name', entryLine, 'project');
    const path = required(found, 'path', entryLine, `project ${name || 'with no name'}`);
    const aka = list(found, 'aka', 'aka must be a list of names, like aka: [mandala]',
      (item) => oneLine(item, 'aka', lineOf(item)) || null);
    const deploy = list(found, 'deploy', 'deploy must be a list, each with name, role and address', (item): Deploy | null => {
      const deployFields = fields(item, DEPLOY_KEYS, 'deploy');
      if (deployFields === null) return null;
      const [deployName, role, address] = DEPLOY_KEYS.map((key) => required(deployFields, key, lineOf(item), 'deploy'));
      return { name: deployName, role, address };
    });

    // One word, one project: find would otherwise have to guess which one you meant. A word an entry
    // repeats itself (`name: crm`, `aka: [CRM]`) is no clash with anyone, so it is counted once.
    const words = new Map([name, ...aka].filter((word) => word !== '').map((word) => [word.toLowerCase(), word]));
    for (const [key, word] of words) {
      const earlier = owner.get(key);
      if (earlier) problem(entryLine, `"${word}" already names ${earlier.project ? `${earlier.project} (line ${earlier.line})` : `the project on line ${earlier.line}`}`);
      else owner.set(key, { project: name, line: entryLine });
    }

    projects.push({ name, aka, path, deploy, site: optional(found, 'site') ?? '', about: optional(found, 'about') ?? '' });
  }
  return problems.length > 0 ? { ok: false, problems } : { ok: true, projects };
}

// The projects a word finds, best first. Name and every aka are fuzzy-matched each on its own, so a
// word cannot match by picking letters out of two fields at once. About is a sentence, where almost
// any short word's letters turn up in order, so it matches only when it contains the word, after
// every name and aka match. A project shows once, at its best.
export function findProjects(projects: readonly Project[], word: string): Project[] {
  const texts = projects.flatMap((project) => [project.name, ...project.aka]
    .filter((text) => text !== '')
    .map((text) => ({ project, text })));
  const byAbout = projects.filter((project) => project.about.toLowerCase().includes(word.toLowerCase()));
  return [...new Set([...ranked(texts, (each) => each.text, word).map((each) => each.project), ...byAbout])];
}

// The file's projects, or what is wrong with it: missing, or every problem readProjects found. Every
// reader of the file starts here, so a missing or broken file is said the one way.
export function projectsListed(text: string | null, filePath: string): { ok: true; projects: Project[] } | { ok: false; message: string } {
  if (text === null) return { ok: false, message: `${filePath} does not exist yet; "dashboard project init" writes a first one from the open and recent projects` };
  const read = readProjects(text, filePath);
  return read.ok ? read : { ok: false, message: read.problems.join('\n') };
}

// ~/.dashboard/projects.yaml's text, or null when there is none. The `project` command and
// projectNamedInFile both read it here. A file that cannot be read for any other reason throws.
export function readProjectsFile(): { text: string | null; filePath: string } {
  const filePath = join(homedir(), BOARD_DIRECTORY, 'projects.yaml');
  try {
    return { text: readFileSync(filePath, 'utf8'), filePath };
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return { text: null, filePath };
  }
}
