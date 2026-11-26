import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { firstProjectsFile } from './projects-first';
import { readProjects } from './projects-file';

describe('firstProjectsFile', () => {
  it('writes a file readProjects reads back, open and recent folders once each, ~ for home', () => {
    const home = path.resolve('/home/me');
    const crm = path.join(home, 'Workspace', 'crm');
    const api = path.resolve('/srv/api');
    const file = firstProjectsFile([crm, api, crm, home], home);
    expect(readProjects(file.file)).toEqual({
      ok: true,
      projects: [
        { name: 'crm', aka: [], path: path.join('~', 'Workspace', 'crm'), site: '', about: '', deploy: [], bumpVersion: false, autoMerge: null },
        { name: 'api', aka: [], path: api, site: '', about: '', deploy: [], bumpVersion: false, autoMerge: null },
        { name: 'me', aka: [], path: '~', site: '', about: '', deploy: [], bumpVersion: false, autoMerge: null },
      ],
    });
    expect(file.count).toBe(3);
  });

  it('names a second folder of the same name apart, so the file still reads', () => {
    const read = readProjects(firstProjectsFile(['/a/web', '/b/Web', '/c/web'], '/home/me').file);
    expect(read.ok && read.projects.map((project) => project.name)).toEqual(['web', 'Web-2', 'web-3']);
  });

  it('writes only the header, still a readable file, when the app knows no project', () => {
    expect(readProjects(firstProjectsFile([], '/home/me').file)).toEqual({ ok: true, projects: [] });
  });

  it('does not take a sibling of home for a folder under it', () => {
    const read = readProjects(firstProjectsFile(['/home/meg/site'], '/home/me').file);
    expect(read.ok && read.projects[0].path).toBe('/home/meg/site');
  });
});
