import { describe, expect, it } from 'vitest';
import { readProjects } from './projects-file';
import { addProject, removeProject, setProject, withOpenedProject, type ProjectsWrite } from './projects-write';

// Skipped on Windows, which reads a POSIX path such as /work/api as one on the current drive.
const posixPathsOnly = it.skipIf(process.platform === 'win32');

const FILE = `# Every project I work on.
- name: new-crm   # the big one
  aka: [crm]
  path: ~/Workspace/new-crm
  deploy:
    - name: new-raxel
      role: test
      address: https://test.example.com

# Side projects below.
- name: screensaver
  path: /work/screensaver
`;

const HOME = '/home/me';
const asWritten = (folder: string) => folder;

function text(result: ProjectsWrite): string {
  if (!result.ok) throw new Error(result.message);
  return result.text;
}

function project(written: string, name: string) {
  const read = readProjects(written);
  if (!read.ok) throw new Error(read.problems.join('\n'));
  return read.projects.find((each) => each.name === name);
}

describe('addProject', () => {
  posixPathsOnly('appends an entry, path from ~, keeping comments and order', () => {
    const written = text(addProject(FILE, 'projects.yaml', '/home/me/api', { aka: ['backend'], site: 'https://api.example.com' }, HOME, asWritten));
    expect(written.startsWith(FILE.replace('new-crm   #', 'new-crm #'))).toBe(true);
    expect(written.endsWith('- name: api\n  aka: [backend]\n  path: ~/api\n  site: https://api.example.com\n')).toBe(true);
  });

  posixPathsOnly('refuses a folder listed already, by its real path, and a name taken', () => {
    expect(addProject(FILE, 'projects.yaml', '/home/me/Workspace/new-crm', {}, HOME, asWritten))
      .toEqual({ ok: false, message: '/home/me/Workspace/new-crm is already listed, as new-crm' });
    const throughLink = (folder: string) => folder.replace('/home/me/ws/', '/home/me/Workspace/');
    expect(addProject(FILE, 'projects.yaml', '/home/me/ws/new-crm', {}, HOME, throughLink))
      .toMatchObject({ ok: false, message: expect.stringContaining('already listed, as new-crm') });
    expect(addProject(FILE, 'projects.yaml', '/home/me/other', { name: 'CRM' }, HOME, asWritten))
      .toMatchObject({ ok: false, message: expect.stringContaining('"CRM" already names new-crm') });
  });

  posixPathsOnly('starts a file when there is none, and refuses to edit one that does not read', () => {
    expect(text(addProject(null, 'projects.yaml', '/work/api', {}, HOME, asWritten))).toBe('- name: api\n  path: /work/api\n');
    expect(addProject('- name: a\n', 'projects.yaml', '/work/api', {}, HOME, asWritten))
      .toEqual({ ok: false, message: 'projects.yaml:1: project a has no path\nnothing was written; fix the file first' });
  });
});

describe('setProject', () => {
  it('adds an aka beside the others, replaces site and about, and finds the project by aka', () => {
    const written = text(setProject(FILE, 'projects.yaml', 'CRM', { aka: ['sales', 'crm'], site: 'https://crm.example.com', about: 'The CRM' }));
    expect(written).toContain('aka: [crm, sales]');
    expect(written).toContain('# the big one');
    expect(project(written, 'new-crm')).toMatchObject({ site: 'https://crm.example.com', about: 'The CRM' });
    expect(project(text(setProject(written, 'projects.yaml', 'crm', { site: 'https://new.example.com' })), 'new-crm')?.site).toBe('https://new.example.com');
  });

  it('adds a deploy by a new name and changes one by its name, leaving the others', () => {
    const added = text(setProject(FILE, 'projects.yaml', 'new-crm', { deploy: [{ name: 'live', role: 'production', address: 'https://crm.example.com' }] }));
    const changed = text(setProject(added, 'projects.yaml', 'new-crm', { deploy: [{ name: 'new-raxel', address: 'https://staging.example.com' }] }));
    expect(project(changed, 'new-crm')?.deploy).toEqual([
      { name: 'new-raxel', role: 'test', address: 'https://staging.example.com' },
      { name: 'live', role: 'production', address: 'https://crm.example.com' },
    ]);
    expect(project(text(setProject(FILE, 'projects.yaml', 'screensaver', { deploy: [{ name: 'box', role: 'test', address: 'http://box' }] })), 'screensaver')?.deploy)
      .toEqual([{ name: 'box', role: 'test', address: 'http://box' }]);
  });

  it('clears a field before setting, so a cleared list can be started again', () => {
    const written = text(setProject(FILE, 'projects.yaml', 'new-crm', { clear: ['aka', 'deploy'], aka: ['sales'] }));
    expect(project(written, 'new-crm')).toMatchObject({ aka: ['sales'], deploy: [] });
  });

  it('refuses what the reader would refuse, and a project nobody is called', () => {
    expect(setProject(FILE, 'projects.yaml', 'new-crm', { deploy: [{ name: 'half', role: 'test' }] }))
      .toMatchObject({ ok: false, message: expect.stringContaining('deploy has no address') });
    expect(setProject(FILE, 'projects.yaml', 'new-crm', { aka: ['screensaver'] }))
      .toMatchObject({ ok: false, message: expect.stringContaining('"screensaver" already names') });
    expect(setProject(FILE, 'projects.yaml', 'nope', { site: 'x' })).toEqual({ ok: false, message: 'no project is called nope' });
  });
});

describe('removeProject', () => {
  it('takes one entry out and leaves the rest as written', () => {
    const written = text(removeProject(FILE, 'projects.yaml', 'screensaver'));
    expect(written).toContain('# the big one');
    expect(readProjects(written)).toMatchObject({ ok: true, projects: [{ name: 'new-crm' }] });
    expect(removeProject(FILE, 'projects.yaml', 'zzz')).toEqual({ ok: false, message: 'no project is called zzz' });
  });
});

describe('withOpenedProject', () => {
  posixPathsOnly('appends a folder the file lacks, under a name nobody has', () => {
    const written = withOpenedProject(FILE, '/home/me/forks/crm', HOME, asWritten);
    expect(written?.endsWith('- name: crm-2\n  path: ~/forks/crm\n')).toBe(true);
    expect(written).toContain('# Side projects below.');
  });

  posixPathsOnly('writes nothing for a listed folder, no file, or a file that does not read', () => {
    expect(withOpenedProject(FILE, '/work/screensaver', HOME, asWritten)).toBeNull();
    expect(withOpenedProject(null, '/work/api', HOME, asWritten)).toBeNull();
    expect(withOpenedProject('- name: a\n', '/work/api', HOME, asWritten)).toBeNull();
  });
});
