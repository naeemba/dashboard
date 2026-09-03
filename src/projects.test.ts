import { describe, expect, it } from 'vitest';
import { parseProjects } from './projects';

const exists = () => true;

describe('parseProjects', () => {
  it('returns an empty list when PROJECTS is unset', () => {
    expect(parseProjects({}, exists)).toEqual([]);
  });

  it('splits on commas and names each project by its last path segment', () => {
    const projects = parseProjects({ PROJECTS: '/code/api,/code/web' }, exists);
    expect(projects.map((project) => project.name)).toEqual(['api', 'web']);
    expect(projects.map((project) => project.path)).toEqual(['/code/api', '/code/web']);
  });

  it('ignores whitespace and empty entries', () => {
    const projects = parseProjects({ PROJECTS: ' /code/api , ,/code/web, ' }, exists);
    expect(projects.map((project) => project.path)).toEqual(['/code/api', '/code/web']);
  });

  it('flags directories that do not exist', () => {
    const projects = parseProjects({ PROJECTS: '/gone,/here' }, (path) => path === '/here');
    expect(projects.map((project) => project.missing)).toEqual([true, false]);
  });

  it('treats a file path as missing', () => {
    expect(parseProjects({ PROJECTS: __filename })[0].missing).toBe(true);
    expect(parseProjects({ PROJECTS: __dirname })[0].missing).toBe(false);
  });
});
