import { describe, expect, it } from 'vitest';
import { expandHome, projectNamed } from './project-named';

const FILE = '- name: new-crm\n  aka: [crm]\n  path: ~/Workspace/new-crm\n- name: new-shop\n  path: /shop\n- name: screensaver\n  aka: [mandala]\n  path: /screensaver\n';
const named = (word: string, text: string | null = FILE) => projectNamed(text, 'projects.yaml', word, '/home/me');

describe('projectNamed', () => {
  it('finds a project by its exact name or aka, in any case, with ~ expanded', () => {
    expect(named('CRM')).toEqual({ ok: true, name: 'new-crm', path: '/home/me/Workspace/new-crm' });
    expect(named('screensaver')).toEqual({ ok: true, name: 'screensaver', path: '/screensaver' });
  });

  it('refuses a path that is neither absolute nor under ~, which main would read against its own folder', () => {
    expect(named('a', '- name: a\n  path: Workspace/a\n')).toEqual({ ok: false, message: "a's path, Workspace/a, must start with / or ~" });
  });

  it('refuses a word that only comes close, naming every project it could be', () => {
    expect(named('new')).toEqual({ ok: false, message: 'no project is called new; it could be new-crm, new-shop' });
  });

  it('refuses a word that names nothing, listing the projects there are', () => {
    expect(named('zzz')).toEqual({ ok: false, message: 'no project is called zzz; projects.yaml has new-crm, new-shop, screensaver' });
  });

  it('says when the file is missing or broken', () => {
    expect(named('crm', null)).toMatchObject({ ok: false, message: expect.stringContaining('does not exist yet') });
    expect(named('crm', '- name: a\n')).toEqual({ ok: false, message: 'projects.yaml:1: project a has no path' });
  });
});

describe('expandHome', () => {
  it('expands only a leading ~ that is the whole first segment', () => {
    expect(expandHome('~', '/home/me')).toBe('/home/me');
    expect(expandHome('~/a', '/home/me')).toBe('/home/me/a');
    expect(expandHome('~other/a', '/home/me')).toBe('~other/a');
    expect(expandHome('/a', '/home/me')).toBe('/a');
  });
});
