import { describe, expect, it } from 'vitest';
import { chromeArguments, configurationFile } from './chat-chrome';

describe('chromeArguments', () => {
  it('passes --chrome when the config turns Claude in Chrome on by default', () => {
    expect(chromeArguments('{"claudeInChromeDefaultEnabled": true}')).toEqual({ chrome: null });
  });

  it('leaves it off when the setting is off, absent or not a boolean', () => {
    expect(chromeArguments('{"claudeInChromeDefaultEnabled": false}')).toEqual({});
    expect(chromeArguments('{}')).toEqual({});
    expect(chromeArguments('{"claudeInChromeDefaultEnabled": "true"}')).toEqual({});
  });

  // A screen must still start when the config is missing or half written.
  it('leaves it off when the config is missing or unreadable', () => {
    expect(chromeArguments(undefined)).toEqual({});
    expect(chromeArguments('{"claudeInChrome')).toEqual({});
    expect(chromeArguments('null')).toEqual({});
  });
});

describe('configurationFile', () => {
  it('reads the config from CLAUDE_CONFIG_DIR, or the home folder when it is unset or empty', () => {
    expect(configurationFile({ CLAUDE_CONFIG_DIR: '/c' }, '/home/ann')).toBe('/c/.claude.json');
    expect(configurationFile({}, '/home/ann')).toBe('/home/ann/.claude.json');
    expect(configurationFile({ CLAUDE_CONFIG_DIR: '' }, '/home/ann')).toBe('/home/ann/.claude.json');
  });
});
