import { describe, expect, it } from 'vitest';
import { cardsProjects, type CardsPage } from './cards';
import { MANAGER_PROJECT, MANAGER_SLOT } from './manager';

function cardsPage(name: string, missing = false): CardsPage {
  return { project: { name, path: `/projects/${name}`, missing }, slot: 0 };
}

describe('cardsProjects', () => {
  it('puts the manager\'s own board first, then every open project\'s', () => {
    const pages = [cardsPage('web'), cardsPage('api')];
    expect(cardsProjects(pages).map((page) => page.project.name)).toEqual(['manager', 'web', 'api']);
  });

  // With nothing open the screen still has a board on it: the manager's own, in the home directory.
  it('keeps the manager\'s own board when no project is open', () => {
    expect(cardsProjects([])).toEqual([{ project: MANAGER_PROJECT, slot: MANAGER_SLOT }]);
  });

  it('drops a project whose folder has gone, since there is no file to read', () => {
    const pages = [cardsPage('web'), cardsPage('api', true)];
    expect(cardsProjects(pages).map((page) => page.project.name)).toEqual(['manager', 'web']);
  });
});
