import { describe, expect, it } from 'vitest';
import { cardsEmptyReason, cardsProjects, type CardsPage } from './cards';

function page(name: string, missing = false): CardsPage {
  return { project: { name, path: `/projects/${name}`, missing }, slot: 0 };
}

describe('cardsProjects', () => {
  it('gives every open project a board', () => {
    const pages = [page('web'), page('api')];
    expect(cardsProjects(pages).map((one) => one.project.name)).toEqual(['web', 'api']);
  });

  it('drops a project whose folder has gone, since there is no file to read', () => {
    const pages = [page('web'), page('api', true)];
    expect(cardsProjects(pages).map((one) => one.project.name)).toEqual(['web']);
  });
});

describe('cardsEmptyReason', () => {
  it('says nothing is open when nothing is', () => {
    expect(cardsEmptyReason([])).toBe('no project is open');
  });

  it('blames the folders when projects are open but every one of them is missing', () => {
    expect(cardsEmptyReason([page('web', true)])).toBe('every open project has lost its folder');
  });
});
