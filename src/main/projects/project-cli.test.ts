import { describe, expect, it } from 'vitest';
import { describeProject, PROJECT_USAGE, runProjectCommand } from './project-cli';
import { readProjects } from './projects-file';

const FILE = '- name: new-crm\n  aka: [crm]\n  path: /crm\n- name: screensaver\n  aka: [mandala]\n  path: /screensaver\n';
const run = (words: string[], text: string | null = FILE) => runProjectCommand(words, text, 'projects.yaml');

describe('runProjectCommand', () => {
  it('answers no verb with the usage and an unknown one with its name', () => {
    expect(run([])).toEqual({ ok: false, message: PROJECT_USAGE });
    expect(run(['open'])).toEqual({ ok: false, message: `no such command: open\n\n${PROJECT_USAGE}` });
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
