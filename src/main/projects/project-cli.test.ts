import { describe, expect, it } from 'vitest';
import { describeProject, namedProject, PROJECT_REQUEST, PROJECT_USAGE, runProjectCommand } from './project-cli';
import { readProjects } from './projects-file';

const FILE = '- name: new-crm\n  aka: [crm]\n  path: /crm\n- name: screensaver\n  aka: [mandala]\n  path: /screensaver\n';
const run = (words: string[], text: string | null = FILE) => runProjectCommand(words, text, 'projects.yaml', '/home/me');

describe('runProjectCommand', () => {
  it('answers no verb with the usage and an unknown one with its name', () => {
    expect(run([])).toEqual({ ok: false, message: PROJECT_USAGE });
    expect(run(['opne'])).toEqual({ ok: false, message: `no such command: opne\n\n${PROJECT_USAGE}` });
    expect(run(['open'])).toEqual({ ok: false, message: `open takes a word\n\n${PROJECT_USAGE}` });
    expect(run(['find'])).toEqual({ ok: false, message: `find takes a word\n\n${PROJECT_USAGE}` });
    expect(run(['list', 'crm'])).toEqual({ ok: false, message: `list takes no words\n\n${PROJECT_USAGE}` });
  });

  it('lists every project and finds by word', () => {
    expect(run(['list'])).toEqual({ ok: true, output: 'new-crm (aka crm)\n  path: /crm\n\nscreensaver (aka mandala)\n  path: /screensaver' });
    expect(run(['find', 'mandala'])).toEqual({ ok: true, output: 'screensaver (aka mandala)\n  path: /screensaver' });
    expect(run(['find', 'zzz'])).toEqual({ ok: false, message: 'no project matches zzz' });
  });

  it('says when the file is missing, empty or broken', () => {
    expect(run(['list'], null)).toEqual({ ok: false, message: 'projects.yaml does not exist yet; write one, a list of projects with a name and a path each' });
    expect(run(['list'], '')).toEqual({ ok: false, message: 'projects.yaml lists no projects' });
    expect(run(['list'], '- name: a\n')).toEqual({ ok: false, message: 'projects.yaml:1: project a has no path' });
  });
});

describe('project open and close', () => {
  it('asks the app with the folder, ~ expanded, and the name, for a name or an aka in any case', () => {
    expect(run(['open', 'Mandala'])).toEqual({ ok: true, ask: [PROJECT_REQUEST, 'open', '/screensaver', 'screensaver'] });
    expect(run(['close', 'new-crm'], '- name: new-crm\n  path: ~/Workspace/new-crm\n'))
      .toEqual({ ok: true, ask: [PROJECT_REQUEST, 'close', '/home/me/Workspace/new-crm', 'new-crm'] });
  });

  // A fuzzy match would close a project you did not name.
  it('refuses a word that only comes close, naming what it came close to', () => {
    expect(run(['close', 'cr'])).toEqual({ ok: false, message: 'no project is named cr — did you mean new-crm, screensaver?' });
    expect(run(['open', 'zzz'])).toEqual({ ok: false, message: 'no project is named zzz' });
  });

  it('refuses a path that is neither absolute nor under ~, which main would read against its own folder', () => {
    expect(run(['open', 'a'], '- name: a\n  path: Workspace/a\n')).toEqual({ ok: false, message: "a's path, Workspace/a, must start with / or ~" });
  });
});

describe('namedProject', () => {
  it('matches the name or an aka exactly, not a fuzzy near miss', () => {
    const read = readProjects(FILE);
    if (!read.ok) throw new Error('unreadable');
    expect(namedProject(read.projects, 'CRM')).toBe(read.projects[0]);
    expect(namedProject(read.projects, 'screen')).toBe('no project is named screen — did you mean screensaver?');
  });
});

const DEPLOYED = `- name: new-crm
  aka: [crm]
  path: ~/Workspace/new-crm
  site: https://crm.example.com
  about: The sales team's CRM
  deploy:
    - name: new-raxel
      role: test
      address: https://test.example.com
    - name: armytech
      role: production
      address: https://armytech.example.com
`;

function firstProject(text: string) {
  const read = readProjects(text);
  if (!read.ok) throw new Error(read.problems.join('\n'));
  return read.projects[0];
}

describe('describeProject', () => {
  it('prints a heading and a line per field it has', () => {
    expect(describeProject(firstProject(DEPLOYED))).toBe(`new-crm (aka crm)
  path: ~/Workspace/new-crm
  site: https://crm.example.com
  about: The sales team's CRM
  deploy test: new-raxel https://test.example.com
  deploy production: armytech https://armytech.example.com`);
  });
});
