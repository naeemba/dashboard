import { describe, expect, it } from 'vitest';
import { describeProject, initialPaths, OUTSIDE_PANE_MESSAGE, PROJECT_USAGE, runProjectCommand, type KnownFolders } from './project-cli';
import { readProjects } from './projects-file';

const FILE = '- name: new-crm\n  aka: [crm]\n  path: /crm\n- name: screensaver\n  aka: [mandala]\n  path: /screensaver\n';
const NO_FOLDERS = () => { throw new Error('asked for the folders'); };
const run = (words: string[], text: string | null = FILE) => runProjectCommand(words, text, 'projects.yaml', NO_FOLDERS, '/home/me');
const init = (text: string | null, folders: () => KnownFolders, words: string[] = []) => runProjectCommand(['init', ...words], text, 'projects.yaml', folders, '/home/me');

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
    expect(run(['list'], null)).toEqual({ ok: false, message: 'projects.yaml does not exist yet; "dashboard project init" writes a first one from the open and recent projects' });
    expect(run(['list'], '')).toEqual({ ok: false, message: 'projects.yaml lists no projects' });
    expect(run(['list'], '- name: a\n')).toEqual({ ok: false, message: 'projects.yaml:1: project a has no path' });
  });
});

describe('project init', () => {
  it('writes from the known folders, and never over a file that is there', () => {
    expect(init(null, () => ({ open: ['/home/me/crm'], recent: ['/home/me/crm'] }))).toEqual({ ok: true, file: expect.stringContaining('path: ~/crm'), output: 'wrote projects.yaml with 1 project; add aka, site, about and deploy by hand' });
    expect(init('', NO_FOLDERS)).toEqual({ ok: false, message: 'projects.yaml already exists; init never overwrites it' });
    expect(init(null, NO_FOLDERS, ['now'])).toEqual({ ok: false, message: `init takes no words\n\n${PROJECT_USAGE}` });
  });

  it('refuses outside a pane rather than write a file with no projects', () => {
    expect(init(null, () => null)).toEqual({ ok: false, message: OUTSIDE_PANE_MESSAGE });
  });

  it('lists the open folders before the recent ones', () => {
    expect(initialPaths({ open: ['/open'], recent: ['/recent'] })).toEqual(['/open', '/recent']);
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
