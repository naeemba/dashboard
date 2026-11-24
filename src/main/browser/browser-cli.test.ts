import { describe, expect, it } from 'vitest';
import { parseBrowserCommand } from './browser-cli';

const command = (...words: string[]) => {
  const parsed = parseBrowserCommand(words);
  return parsed.ok ? parsed.command : parsed.message;
};

describe('parseBrowserCommand', () => {
  it('reads open and tabs, with a project or without', () => {
    expect(command('open', 'localhost:5173')).toEqual({ verb: 'open', url: 'localhost:5173', project: null });
    expect(command('open', 'example.com', '--project', 'web')).toEqual({ verb: 'open', url: 'example.com', project: 'web' });
    expect(command('tabs')).toEqual({ verb: 'tabs', project: null });
  });

  it('reads the verbs that take only a tab', () => {
    for (const verb of ['claim', 'release', 'back', 'forward', 'reload', 'reset', 'snapshot', 'console', 'network']) {
      expect(command(verb, '3')).toEqual({ verb, tab: 3 });
    }
  });

  it('reads each verb\'s words and flags', () => {
    expect(command('go', '3', 'example.com')).toEqual({ verb: 'go', tab: 3, url: 'example.com' });
    expect(command('resize', '3', '390x844')).toEqual({ verb: 'resize', tab: 3, width: 390, height: 844 });
    expect(command('read', '3', '--max-tokens', '800', '--selector', '#main')).toEqual({ verb: 'read', tab: 3, maxTokens: 800, selector: '#main' });
    expect(command('read', '3')).toEqual({ verb: 'read', tab: 3, maxTokens: null, selector: null });
    expect(command('screenshot', '3', '--full')).toEqual({ verb: 'screenshot', tab: 3, full: true, element: null });
    expect(command('screenshot', '3', '--element', '.card')).toEqual({ verb: 'screenshot', tab: 3, full: false, element: '.card' });
    expect(command('click', '3', 'e4')).toEqual({ verb: 'click', tab: 3, ref: 'e4' });
    expect(command('type', '3', 'e4', 'hello there')).toEqual({ verb: 'type', tab: 3, ref: 'e4', text: 'hello there' });
    expect(command('press', '3', 'Enter')).toEqual({ verb: 'press', tab: 3, key: 'Enter', ref: null });
    expect(command('press', '3', 'Enter', 'e4')).toEqual({ verb: 'press', tab: 3, key: 'Enter', ref: 'e4' });
    expect(command('eval', '3', 'jobs.js', '--wait-for', '.job')).toEqual({ verb: 'eval', tab: 3, file: 'jobs.js', waitFor: '.job' });
    expect(command('eval', '3', 'jobs.js')).toEqual({ verb: 'eval', tab: 3, file: 'jobs.js', waitFor: null });
  });

  it('refuses what it cannot read, before the app is asked', () => {
    expect(command('claim')).toBe('browser claim needs a tab id, the one `browser tabs` prints');
    expect(command('claim', '3', 'extra')).toBe('browser claim takes only a tab id');
    expect(command('resize', '3', 'phone')).toBe('browser resize takes a tab id and a size, like 390x844');
    expect(command('read', '3', '--max-tokens', '0')).toBe('--max-tokens takes a whole number above 0');
    expect(command('read', '3', '--max-tokens')).toBe('--max-tokens needs a value');
    expect(command('screenshot', '3', '--full', '--element', 'a')).toBe('a screenshot is of the full page or of one element, not both');
    expect(command('click', '3', 'e1', '--full')).toBe('browser click takes no --full');
    expect(command('read', '3', '--max-tokens=800')).toEqual({ verb: 'read', tab: 3, maxTokens: 800, selector: null });
    expect(command('open')).toBe('browser open takes one address');
    expect(command('eval', '3')).toBe('browser eval takes a tab id and a script file');
    expect(command('fly', '3')).toMatch(/^no such verb: browser fly/);
  });
});
