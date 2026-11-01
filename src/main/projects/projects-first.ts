import { basename, sep } from 'node:path';
import { stringify } from 'yaml';

// `project init`: a first ~/.dashboard/projects.yaml written from the projects the app knows, the
// open ones first, then the recent ones, so the owner starts from a list rather than a blank file.
// Only name and path are filled; aka, site, about and deploy are the owner's to add. Writing the file,
// and never over one that is there, is project-program.ts's job.

const HEADER = `# Every project the manager can be asked about. Written by \`dashboard project init\` from the
# open and recent projects; edit it by hand. name and path are required. Each project also takes:
#   aka: [other, names]
#   site: https://example.com
#   about: one line saying what it is
#   deploy:
#     - name: server
#       role: production
#       address: https://example.com
`;

// A path under home is written from ~, the way a person would write it.
function writtenPath(path: string, home: string): string {
  if (path === home) return '~';
  if (!path.startsWith(home + sep)) return path;
  return `~${path.slice(home.length)}`;
}

// Each path once, in the order given. Two folders sharing a name get -2, -3: readProjects refuses
// one word naming two projects.
export function firstProjectsFile(paths: readonly string[], home: string): { file: string; count: number } {
  const taken = new Set<string>();
  const projects = [...new Set(paths)].map((path) => {
    const base = basename(path) || path;
    let name = base;
    for (let count = 2; taken.has(name.toLowerCase()); count += 1) name = `${base}-${count}`;
    taken.add(name.toLowerCase());
    return { name, path: writtenPath(path, home) };
  });
  // stringify([]) is "[]", not an empty list of entries.
  return { file: projects.length === 0 ? HEADER : HEADER + stringify(projects), count: projects.length };
}
