import { describe, expect, it } from 'vitest';
import { parseProjects, projectFromPath, replacesProject } from './projects';

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

  it('normalises paths so a trailing slash is the same project as without one', () => {
    expect(projectFromPath('/code/api/', exists)).toEqual(projectFromPath('/code/api', exists));
    expect(projectFromPath('/code/api/', exists).name).toBe('api');
  });

  it('treats a file path as missing', () => {
    expect(parseProjects({ PROJECTS: __filename })[0].missing).toBe(true);
    expect(parseProjects({ PROJECTS: __dirname })[0].missing).toBe(false);
  });
});

describe('replacesProject', () => {
  const live = { name: 'api', path: '/code/api', missing: false };
  const missing = { name: 'api', path: '/code/api', missing: true };

  it('fills an empty slot', () => {
    expect(replacesProject(undefined, live)).toBe(true);
  });

  it('upgrades a project that was missing at launch', () => {
    expect(replacesProject(missing, live)).toBe(true);
  });

  it('leaves a project that already works alone', () => {
    expect(replacesProject(live, live)).toBe(false);
  });

  it('does not downgrade a live project to a missing one', () => {
    expect(replacesProject(live, missing)).toBe(false);
  });
});
