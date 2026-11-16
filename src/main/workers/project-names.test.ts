import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { holdProjectName, projectName, readProjectNames } from './project-names';
import { mainSessionName, workerSessionName } from './dispatch';
import { MANAGER_FOLDER } from '../manager/manager-terminals';
import { temporaryFolder } from '../testing/temporary-folder';

const work = join('work', 'api');
const clients = join('clients', 'api');

// A launch: the names read back from the file, then the projects opened in this order.
function launch(file: string, ...opened: string[]): void {
  readProjectNames(file);
  for (const projectPath of opened) holdProjectName(projectPath);
}

describe('two projects with the same folder name', () => {
  // SendMessage to main-api would otherwise reach whichever of the two answered first.
  it('names the second one api-2, main and workers alike', () => {
    launch(join(temporaryFolder('project-names-'), 'names.json'), work, clients);
    expect(mainSessionName(work)).toBe('main-api');
    expect(mainSessionName(clients)).toBe('main-api-2');
    expect(workerSessionName(clients, 2)).toBe('api-2-terminal-3');
  });

  // A worker resumed after a restart still has "SendMessage to main-api-2" in its conversation, so a
  // reorder of the tabs must not hand that name to the other folder.
  it('keeps each folder\'s name when a restart opens them in the other order', () => {
    const file = join(temporaryFolder('project-names-'), 'names.json');
    launch(file, work, clients);
    launch(file, clients, work);
    expect([projectName(work), projectName(clients)]).toEqual(['api', 'api-2']);
  });

  // A worker of the closed one may still be reporting to it.
  it('never gives a folder another folder\'s name, open or not', () => {
    const file = join(temporaryFolder('project-names-'), 'names.json');
    launch(file, work, join('other', 'api'));
    launch(file, clients);
    expect(projectName(clients)).toBe('api-3');
  });

  it('goes by the folder for a path never opened', () => {
    expect(projectName(join('elsewhere', 'My API'))).toBe('my-api');
  });
});

describe('the manager\'s name', () => {
  it('is never given to a folder, whatever the file says', () => {
    const file = join(temporaryFolder('project-names-'), 'names.json');
    writeFileSync(file, JSON.stringify({ [MANAGER_FOLDER]: 'x' }));
    launch(file, join('work', 'manager'));
    expect(mainSessionName(MANAGER_FOLDER)).toBe('main-manager');
    expect(projectName(join('work', 'manager'))).toBe('manager-2');
  });
});
