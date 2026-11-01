import { describe, expect, it } from 'vitest';
import { findProjects, readProjects, type Project } from './projects-file';

const FILE = `- name: new-crm
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
- name: screensaver
  aka: [mandala]
  path: ~/Workspace/screensaver
  about: Drawing patterns while idle
`;

function projects(text: string): Project[] {
  const read = readProjects(text);
  if (!read.ok) throw new Error(read.problems.join('\n'));
  return read.projects;
}

describe('readProjects', () => {
  it('reads every field, with the optional ones empty where absent', () => {
    const [crm, screensaver] = projects(FILE);
    expect(crm).toEqual({
      name: 'new-crm', aka: ['crm'], path: '~/Workspace/new-crm', site: 'https://crm.example.com',
      about: 'The sales team\'s CRM',
      deploy: [
        { name: 'new-raxel', role: 'test', address: 'https://test.example.com' },
        { name: 'armytech', role: 'production', address: 'https://armytech.example.com' },
      ],
    });
    expect(screensaver).toMatchObject({ site: '', deploy: [] });
  });

  it('reads an empty file as no projects', () => {
    expect(readProjects('')).toEqual({ ok: true, projects: [] });
    expect(readProjects('# nothing yet\n')).toEqual({ ok: true, projects: [] });
  });

  it('names the line of a parse error', () => {
    const read = readProjects('- name: a\n  path: b\n  about: [unclosed\n');
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.problems[0]).toMatch(/^projects\.yaml:\d+: /);
  });

  it('names the line of every problem, all in one pass', () => {
    const read = readProjects(`- name: a
  path: /a
  alias: [x]
- path: /b
  aka: x
- name: c
  path: /c
  deploy:
    - name: test
      address: http://c
- name: d
  path: /d
  aka: [A]
`);
    expect(read).toEqual({ ok: false, problems: [
      'projects.yaml:3: project has no field "alias" (it takes name, aka, path, site, about, deploy)',
      'projects.yaml:4: project has no name',
      'projects.yaml:5: aka must be a list of names, like aka: [mandala]',
      'projects.yaml:9: deploy has no role',
      'projects.yaml:11: "A" already names a (line 1)',
    ] });
  });

  it('refuses a file that is not a list, a duplicate key and a field that is not text', () => {
    expect(readProjects('name: a\npath: b\n')).toEqual({ ok: false, problems: ['projects.yaml:1: the file must be a list of projects, each starting with "- name:"'] });
    expect(readProjects('- name: a\n  name: b\n  path: c\n').ok).toBe(false);
    expect(readProjects('- name: [a]\n  path: c\n')).toEqual({ ok: false, problems: ['projects.yaml:1: name must be one line of text'] });
  });

  it('reads a key with nothing after it as absent', () => {
    expect(projects('- name: a\n  path: /a\n  site:\n  about: ~\n  aka:\n  deploy: null\n')[0])
      .toMatchObject({ site: '', about: '', aka: [], deploy: [] });
    expect(readProjects('- name: a\n  path:\n')).toEqual({ ok: false, problems: ['projects.yaml:2: project a has no path'] });
  });

  it('refuses text on two lines and keeps a number as written', () => {
    expect(readProjects('- name: a\n  path: /a\n  about: |\n    one\n    two\n'))
      .toEqual({ ok: false, problems: ['projects.yaml:3: about must be one line of text'] });
    expect(projects("- name: a\n  path: /a\n  about: >\n    The sales team's CRM,\n    used by everyone\n")[0].about)
      .toBe("The sales team's CRM, used by everyone");
    expect(projects('- name: a\n  path: /a\n  about: |\n    one line\n')[0].about).toBe('one line');
    expect(projects('- name: 0123\n  aka: [1.10]\n  path: /a\n')[0]).toMatchObject({ name: '0123', aka: ['1.10'] });
  });

  it('lets an entry repeat its own word and names a nameless earlier owner by its line', () => {
    expect(projects('- name: crm\n  aka: [CRM]\n  path: /crm\n')[0]).toMatchObject({ name: 'crm', aka: ['CRM'] });
    expect(readProjects('- path: /a\n  aka: [x]\n- name: b\n  path: /b\n  aka: [x]\n')).toEqual({ ok: false, problems: [
      'projects.yaml:1: project has no name',
      'projects.yaml:3: "x" already names the project on line 1',
    ] });
  });
});

describe('findProjects', () => {
  const all = projects(FILE);
  const names = (word: string) => findProjects(all, word).map((project) => project.name);

  it('matches name, aka and about, ignoring case', () => {
    expect(names('screensaver')).toEqual(['screensaver']);
    expect(names('MANDALA')).toEqual(['screensaver']);
    expect(names('sales')).toEqual(['new-crm']);
  });

  it('lists a project once, at its best match, and nothing for no match', () => {
    expect(names('crm')).toEqual(['new-crm']);
    expect(names('zzz')).toEqual([]);
  });

  it('matches about only where it contains the word, after name and aka', () => {
    const photos = projects('- name: shop\n  path: /shop\n  about: Photo sharing app for a retail chain\n');
    expect(findProjects(photos, 'pharia')).toEqual([]);
    expect(findProjects(photos, 'SHARING').map((project) => project.name)).toEqual(['shop']);
    expect(names('idle')).toEqual(['screensaver']);
    const billing = projects('- name: billing\n  path: /billing\n  about: Invoices sent from the crm\n' + FILE);
    expect(findProjects(billing, 'crm').map((project) => project.name)).toEqual(['new-crm', 'billing']);
  });
});
