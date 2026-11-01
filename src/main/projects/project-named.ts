import { homedir } from 'node:os';
import { wholePath } from '../nvim/file-open';
import { findProjects, projectsListed, readProjectsFile } from './projects-file';

// The one project a word names in ~/.dashboard/projects.yaml, for whatever opens or dispatches into a
// project by name. Only an exact name or aka counts, in any case: a fuzzy match is a guess, and a
// guess here starts work in the wrong checkout. A word that names none is refused with the projects
// it comes closest to, so the asker can pick one and say it again.

export type ProjectNamed = { ok: true; name: string; path: string } | { ok: false; message: string };

export function projectNamed(text: string | null, filePath: string, word: string, home: string): ProjectNamed {
  const listed = projectsListed(text, filePath);
  if (!listed.ok) return listed;
  const wanted = word.trim().toLowerCase();
  // readProjects refuses two projects sharing a name or aka in any case, so at most one is found.
  const found = listed.projects.find((project) => [project.name, ...project.aka].some((each) => each.toLowerCase() === wanted));
  if (found) {
    // The file's `path` is written by hand and kept as written; `~` is the home folder only here, where
    // a project is about to be opened from it. A relative path is refused: main would read it against
    // its own folder, which is not where anyone wrote it from.
    const folder = wholePath(found.path, home);
    if (folder === undefined) return { ok: false, message: `${found.name}'s path, ${found.path}, must start with / or ~` };
    return { ok: true, name: found.name, path: folder };
  }
  const near = findProjects(listed.projects, word).map((project) => project.name);
  return {
    ok: false,
    message: near.length > 0
      ? `no project is called ${word}; it could be ${near.join(', ')}`
      : `no project is called ${word}; ${filePath} has ${listed.projects.map((project) => project.name).join(', ') || 'none'}`,
  };
}

// projectNamed against the file on disk and this user's home folder: what main asks.
export function projectNamedInFile(word: string): ProjectNamed {
  const { text, filePath } = readProjectsFile();
  return projectNamed(text, filePath, word, homedir());
}
