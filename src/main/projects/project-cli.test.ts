import { describe, expect, it } from 'vitest';
import { describeProject, initialPaths, NO_APP_DATA_MESSAGE, PROJECT_REQUEST, PROJECT_USAGE, runProjectCommand, type KnownFolders } from './project-cli';
import { readProjects } from './projects-file';

// Skipped on Windows, which reads a POSIX path such as /work/api as one on the current drive, D:\work\api, so the paths these expect never come back.
const posixPathsOnly = it.skipIf(process.platform === 'win32');

const FILE = '- name: new-crm\n  aka: [crm]\n  path: /crm\n- name: screensaver\n  aka: [mandala]\n  path: /screensaver\n';
const NO_FOLDERS = () => { throw new Error('asked for the folders'); };
const run = (words: string[], text: string | null = FILE, folders: () => KnownFolders = NO_FOLDERS) => runProjectCommand(words, text, 'projects.yaml', folders, '/home/me');
const NONE_OPEN = () => null;
const init = (text: string | null, folders: () => KnownFolders, words: string[] = []) => runProjectCommand(['init', ...words], text, 'projects.yaml', folders, '/home/me');

describe('runProjectCommand', () => {
  it('answers no verb with the usage and an unknown one with its name', () => {
    expect(run([])).toEqual({ ok: false, message: PROJECT_USAGE });
    expect(run(['opne'])).toEqual({ ok: false, message: `no such command: opne\n\n${PROJECT_USAGE}` });
    expect(run(['open'])).toEqual({ ok: false, message: `open takes a word\n\n${PROJECT_USAGE}` });
    expect(run(['find'])).toEqual({ ok: false, message: `find takes a word\n\n${PROJECT_USAGE}` });
    expect(run(['list', 'crm'])).toEqual({ ok: false, message: `list takes no words\n\n${PROJECT_USAGE}` });
  });

  it('lists every project and finds by word', () => {
    expect(run(['list'], FILE, NONE_OPEN)).toEqual({ ok: true, output: 'new-crm (aka crm)\n  path: /crm\n\nscreensaver (aka mandala)\n  path: /screensaver' });
    expect(run(['find', 'mandala'])).toEqual({ ok: true, output: 'screensaver (aka mandala)\n  path: /screensaver' });
    expect(run(['find', 'zzz'])).toEqual({ ok: false, message: 'no project matches zzz' });
  });

  // What the app had open at its last save, read from its own files: list never starts the app.
  posixPathsOnly('marks the projects the app has open, and lists open ones the file does not', () => {
    const open = () => ({ open: ['/crm', '/home/me/notes'], recent: [] });
    expect(run(['list'], FILE, open)).toEqual({
      ok: true,
      output: 'new-crm (aka crm)\n  path: /crm\n  open\n\nscreensaver (aka mandala)\n  path: /screensaver\n\nnotes\n  path: /home/me/notes\n  open, not in projects.yaml',
    });
    expect(run(['list'], null, open)).toMatchObject({ ok: true, output: expect.stringContaining('notes\n  path: /home/me/notes') });
    expect(run(['list'], '- name: a\n', open)).toEqual({ ok: false, message: 'projects.yaml:1: project a has no path' });
  });

  it('says when the file is missing, empty or broken', () => {
    expect(run(['list'], null, NONE_OPEN)).toEqual({ ok: false, message: 'projects.yaml does not exist yet; "dashboard project init" writes a first one from the open and recent projects' });
    expect(run(['list'], '', NONE_OPEN)).toEqual({ ok: false, message: 'projects.yaml lists no projects' });
    expect(run(['list'], '- name: a\n', NONE_OPEN)).toEqual({ ok: false, message: 'projects.yaml:1: project a has no path' });
  });
});

describe('project open, close and focus', () => {
  posixPathsOnly('asks the app with the folder, ~ expanded, and the name, for a name or an aka in any case', () => {
    expect(run(['open', 'Mandala'])).toEqual({ ok: true, ask: [PROJECT_REQUEST, 'open', '/screensaver', 'screensaver'] });
    expect(run(['close', 'new-crm'], '- name: new-crm\n  path: ~/Workspace/new-crm\n'))
      .toEqual({ ok: true, ask: [PROJECT_REQUEST, 'close', '/home/me/Workspace/new-crm', 'new-crm'] });
    expect(run(['focus', 'crm'])).toEqual({ ok: true, ask: [PROJECT_REQUEST, 'focus', '/crm', 'new-crm'] });
  });

  // A fuzzy match would close a project you did not name. The refusal is projectNamed's.
  it('refuses a word that only comes close, naming what it came close to', () => {
    expect(run(['close', 'cr'])).toEqual({ ok: false, message: 'no project is called cr; it could be new-crm, screensaver' });
  });
});

describe('project init', () => {
  posixPathsOnly('writes from the known folders, and never over a file that is there', () => {
    expect(init(null, () => ({ open: ['/home/me/crm'], recent: ['/home/me/crm'] }))).toEqual({ ok: true, file: expect.stringContaining('path: ~/crm'), output: 'wrote projects.yaml with 1 project; add aka, site, about and deploy with "dashboard project set" or by hand' });
    expect(init('', NO_FOLDERS)).toEqual({ ok: false, message: 'projects.yaml already exists; init never overwrites it' });
    expect(init(null, NO_FOLDERS, ['now'])).toEqual({ ok: false, message: `init takes no words\n\n${PROJECT_USAGE}` });
  });

  it('refuses before the app has ever run rather than write a file with no projects', () => {
    expect(init(null, () => null)).toEqual({ ok: false, message: NO_APP_DATA_MESSAGE });
  });

  it('lists the open folders before the recent ones', () => {
    expect(initialPaths({ open: ['/open'], recent: ['/recent'] })).toEqual(['/open', '/recent']);
  });
});

describe('project add, set and remove', () => {
  const edit = (words: string[], text: string | null = FILE) => runProjectCommand(words, text, 'projects.yaml', NO_FOLDERS, '/home/me', (folder) => folder);
  const written = (words: string[], text: string | null = FILE) => {
    const answer = edit(words, text);
    if (!answer.ok || !('file' in answer) || answer.file === undefined) throw new Error(JSON.stringify(answer));
    const read = readProjects(answer.file);
    return read.ok ? read.projects.find((project) => project.name === 'screensaver') : read;
  };

  posixPathsOnly('adds a folder with its flags, the name from the folder unless given', () => {
    expect(edit(['add', '~/api', '--aka', 'backend, server', '--about=The API'])).toMatchObject({ ok: true, output: 'added api in projects.yaml', file: expect.stringContaining('- name: api\n  aka: [backend, server]\n  path: ~/api\n  about: The API\n') });
    expect(edit(['add', '/work/x', '--name', 'thing'])).toMatchObject({ ok: true, output: 'added thing in projects.yaml' });
    expect(edit(['add', '/crm'])).toEqual({ ok: false, message: '/crm is already listed, as new-crm' });
  });

  it('reads every set flag, each --deploy and --clear on its own', () => {
    const changed = written(['set', 'mandala', '--aka', 'saver', '--site', 'https://s.example.com', '--deploy', 'name=box,role=test,address=http://box?a=b', '--deploy', 'name=live,role=production,address=https://live?tags=a,b']);
    expect(changed).toMatchObject({ name: 'screensaver', aka: ['mandala', 'saver'], site: 'https://s.example.com', deploy: [{ name: 'box', address: 'http://box?a=b' }, { name: 'live', address: 'https://live?tags=a,b' }] });
    expect(written(['set', 'screensaver', '--clear', 'aka', '--clear', 'site'], '- name: screensaver\n  aka: [m]\n  path: /s\n  site: x\n')).toMatchObject({ aka: [], site: '' });
  });

  it('refuses a set with nothing to set and flags it does not take', () => {
    expect(edit(['set', 'crm'])).toEqual({ ok: false, message: `set takes at least one of --aka, --site, --about, --deploy, --clear\n\n${PROJECT_USAGE}` });
    expect(edit(['set', 'crm', '--clear', 'path'])).toEqual({ ok: false, message: '--clear takes aka, site, about, deploy; name and path are required' });
    expect(edit(['set', 'crm', '--deploy', 'role=test'])).toEqual({ ok: false, message: '--deploy needs name=<n>, the deploy to add or change' });
    expect(edit(['set', 'crm', '--deploy', 'name=a,where=b'])).toEqual({ ok: false, message: '--deploy takes name=<n>,role=<r>,address=<a>, not where=b' });
    expect(edit(['set', '--site', 'x'])).toEqual({ ok: false, message: `set takes a name first\n\n${PROJECT_USAGE}` });
    expect(edit(['remove', 'crm', '--name', 'x'])).toEqual({ ok: false, message: `remove takes one name and no flags\n\n${PROJECT_USAGE}` });
  });

  it('removes a project by name or aka', () => {
    expect(edit(['remove', 'Mandala'])).toEqual({ ok: true, file: '- name: new-crm\n  aka: [crm]\n  path: /crm\n', output: 'removed screensaver in projects.yaml' });
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
