import { firstProjectsFile } from './projects-first';
import { findProjects, readProjects, type Project } from './projects-file';

// The `project` noun's decisions: which verb, and what it answers given the file's text. The file
// itself is project-program.ts's to read, so every branch here is a test away.

export const PROJECT_USAGE = `project — the projects in ~/.dashboard/projects.yaml

  project list          every project
  project find <word>   the projects whose name or aka match the word, then whose about contains it
  project init          write a first projects.yaml from the open and recent projects, never over one`;

// `file`, from init alone, is what to write to the file before printing the output.
export type ProjectAnswer = { ok: true; output: string; file?: string } | { ok: false; message: string };

// `text` is the file's contents, or null when there is no file.
export function runProjectCommand(commandArguments: readonly string[], text: string | null, filePath: string): ProjectAnswer {
  const [verb, ...rest] = commandArguments;
  if (verb !== 'list' && verb !== 'find') {
    return { ok: false, message: verb === undefined ? PROJECT_USAGE : `no such command: ${verb}\n\n${PROJECT_USAGE}` };
  }
  const word = rest.join(' ').trim();
  if (verb === 'find' && word === '') return { ok: false, message: `find takes a word\n\n${PROJECT_USAGE}` };
  if (verb === 'list' && rest.length > 0) return { ok: false, message: `list takes no words\n\n${PROJECT_USAGE}` };

  if (text === null) return { ok: false, message: `${filePath} does not exist yet; "dashboard project init" writes a first one from the open and recent projects` };
  const read = readProjects(text, filePath);
  if (!read.ok) return { ok: false, message: read.problems.join('\n') };

  const projects = verb === 'find' ? findProjects(read.projects, word) : read.projects;
  if (projects.length === 0) return { ok: false, message: verb === 'find' ? `no project matches ${word}` : `${filePath} lists no projects` };
  return { ok: true, output: projects.map(describeProject).join('\n\n') };
}

// `project init`, the one verb that writes: what it writes, given the words after init, the file's text
// (null when there is none) and the folders the app has open and has opened, most wanted first, asked
// for only once nothing refuses. Refused, never overwritten, when the file is there.
// project-program.ts sends init here, every other verb to runProjectCommand, and writes `file`.
export function projectInit(words: readonly string[], text: string | null, knownPaths: () => string[], home: string, filePath: string): ProjectAnswer {
  if (words.length > 0) return { ok: false, message: `init takes no words\n\n${PROJECT_USAGE}` };
  if (text !== null) return { ok: false, message: `${filePath} already exists; init never overwrites it` };
  const { file, count } = firstProjectsFile(knownPaths(), home);
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
