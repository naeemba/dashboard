import { describe, expect, it } from 'vitest';
import { isProjectPage, landingPosition, projectPosition } from './manager';

describe('isProjectPage', () => {
  it('says the manager is not one, so it never moves and is never saved', () => {
    expect(isProjectPage({ mode: 'manager' })).toBe(false);
  });

  it('says every view a project can show is one', () => {
    expect(isProjectPage({ mode: 'terminals' })).toBe(true);
    expect(isProjectPage({ mode: 'nvim' })).toBe(true);
    expect(isProjectPage({ mode: 'board' })).toBe(true);
  });
});

describe('projectPosition', () => {
  it('never lands a project in front of the manager', () => {
    expect(projectPosition(0)).toBe(1);
  });

  it('leaves every position behind the manager alone', () => {
    expect(projectPosition(1)).toBe(1);
    expect(projectPosition(4)).toBe(4);
  });
});

describe('landingPosition', () => {
  it('opens on the project the last run was left on', () => {
    expect(landingPosition(3, 1)).toBe(3);
  });

  it('falls to the first project when the one it was left on is gone', () => {
    expect(landingPosition(-1, 2)).toBe(2);
  });

  it('lands on the manager only when no project survived', () => {
    expect(landingPosition(-1, -1)).toBe(0);
  });
});
