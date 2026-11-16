import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { holdProjectName, projectName, releaseProjectName } from './project-names';
import { mainSessionName, workerSessionName } from './dispatch';

const work = join('work', 'api');
const clients = join('clients', 'api');
const opened: string[] = [];

function open(projectPath: string): string {
  opened.push(projectPath);
  return holdProjectName(projectPath);
}

afterEach(() => {
  for (const projectPath of opened.splice(0)) releaseProjectName(projectPath);
});

describe('two open projects with the same folder name', () => {
  // SendMessage to main-api would otherwise reach whichever of the two answered first.
  it('names the second one api-2, main and workers alike', () => {
    open(work);
    open(clients);
    expect(mainSessionName(work)).toBe('main-api');
    expect(mainSessionName(clients)).toBe('main-api-2');
    expect(workerSessionName(clients, 2)).toBe('api-2-terminal-3');
  });

  // A running main renamed would leave its workers reporting to a name nobody has.
  it('keeps a name while the project is open, however often it is opened', () => {
    open(work);
    open(clients);
    expect(open(clients)).toBe('api-2');
    releaseProjectName(work);
    expect(projectName(clients)).toBe('api-2');
  });

  it('gives a closed project\'s name to the next one to open', () => {
    open(work);
    releaseProjectName(work);
    expect(open(clients)).toBe('api');
  });

  it('goes by the folder for a path that is not open', () => {
    expect(projectName(join('elsewhere', 'My API'))).toBe('my-api');
  });
});

describe('a project folder called manager', () => {
  // The manager's main is main-manager.
  it('is never given the manager\'s name', () => {
    expect(open(join('work', 'manager'))).toBe('manager-2');
  });
});
