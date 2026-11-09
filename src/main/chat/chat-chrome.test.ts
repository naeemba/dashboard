import { describe, expect, it } from 'vitest';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { temporaryFolder } from '../testing/temporary-folder';
import { chromeArguments, chromeArgumentsFor, chromeFromEnvironment, configurationFile } from './chat-chrome';

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
    expect(configurationFile({ CLAUDE_CONFIG_DIR: '/c' }, '/home/ann')).toBe(path.join('/c', '.claude.json'));
    expect(configurationFile({}, '/home/ann')).toBe(path.join('/home/ann', '.claude.json'));
    expect(configurationFile({ CLAUDE_CONFIG_DIR: '' }, '/home/ann')).toBe(path.join('/home/ann', '.claude.json'));
  });
});

describe('chromeFromEnvironment', () => {
  it('reads CLAUDE_CODE_ENABLE_CFC as on, off, or not said', () => {
    expect(chromeFromEnvironment({ CLAUDE_CODE_ENABLE_CFC: '1' })).toBe(true);
    expect(chromeFromEnvironment({ CLAUDE_CODE_ENABLE_CFC: 'true' })).toBe(true);
    expect(chromeFromEnvironment({ CLAUDE_CODE_ENABLE_CFC: '0' })).toBe(false);
    expect(chromeFromEnvironment({ CLAUDE_CODE_ENABLE_CFC: 'false' })).toBe(false);
    expect(chromeFromEnvironment({})).toBeUndefined();
    expect(chromeFromEnvironment({ CLAUDE_CODE_ENABLE_CFC: 'maybe' })).toBeUndefined();
  });
});

describe('chromeArgumentsFor', () => {
  it('lets CLAUDE_CODE_ENABLE_CFC override the config either way, and falls back to it', async () => {
    const folder = temporaryFolder('chat-chrome-');
    await writeFile(path.join(folder, '.claude.json'), '{"claudeInChromeDefaultEnabled": true}');
    expect(await chromeArgumentsFor({ CLAUDE_CODE_ENABLE_CFC: '0' }, folder)).toEqual({});
    expect(await chromeArgumentsFor({}, folder)).toEqual({ chrome: null });
    expect(await chromeArgumentsFor({ CLAUDE_CODE_ENABLE_CFC: '1' }, path.join(folder, 'none'))).toEqual({ chrome: null });
    expect(await chromeArgumentsFor({}, path.join(folder, 'none'))).toEqual({});
  });
});
