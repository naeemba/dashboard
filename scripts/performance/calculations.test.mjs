import { describe, expect, it } from 'vitest';
import { bytesPerSource, decodeSegment, isDemoProcess, keyEvent, ownerOf, spread } from './calculations.mjs';

describe('isDemoProcess', () => {
  const demo = { group: 500, home: '/tmp/perf/home', userData: '/tmp/perf/userdata' };
  const process = (overrides) => ({ processGroup: 1, commandLine: 'zsh\0', environment: 'HOME=/home/me\0', ...overrides });

  it('takes the instance process group', () => {
    expect(isDemoProcess(process({ processGroup: 500 }), demo)).toBe(true);
  });

  it('takes a process carrying the demo user data or HOME', () => {
    expect(isDemoProcess(process({ commandLine: 'electron\0--user-data-dir=/tmp/perf/userdata\0' }), demo)).toBe(true);
    expect(isDemoProcess(process({ environment: 'PATH=/bin\0HOME=/tmp/perf/home\0' }), demo)).toBe(true);
  });

  it('leaves a shell that only sits under the demo folder', () => {
    expect(isDemoProcess(process({ environment: 'HOME=/home/me\0PWD=/tmp/perf/home\0OLDPWD=/tmp/perf/home/projects\0' }), demo)).toBe(false);
    expect(isDemoProcess(process({ environment: 'HOME=/tmp/perf/home2\0' }), demo)).toBe(false);
  });
});

describe('keyEvent', () => {
  it('sends Ctrl+digit as a shortcut that types nothing', () => {
    expect(keyEvent('Ctrl+2')).toEqual({ base: { modifiers: 2, key: '2', code: 'Digit2', windowsVirtualKeyCode: 50, nativeVirtualKeyCode: 50 }, text: undefined });
  });

  it('sets every modifier bit', () => {
    expect(keyEvent('Alt+Ctrl+Meta+Shift+t').base).toMatchObject({ modifiers: 15, key: 'T', code: 'KeyT' });
  });

  it('types a bare letter, and Shift alone still types', () => {
    expect(keyEvent('x').text).toBe('x');
    expect(keyEvent('Shift+t').text).toBe('T');
  });

  it('types a carriage return for a bare Enter only', () => {
    expect(keyEvent('Enter')).toMatchObject({ base: { code: 'Enter', windowsVirtualKeyCode: 13 }, text: '\r' });
    expect(keyEvent('Shift+Enter').text).toBeUndefined();
    expect(keyEvent('ArrowDown')).toMatchObject({ base: { windowsVirtualKeyCode: 40 }, text: undefined });
  });
});

describe('spread', () => {
  it('takes nearest-rank median and p90', () => {
    expect(spread([10, 1, 9, 2, 8, 3, 7, 4, 6, 5])).toEqual({ samples: 10, median: 6, p90: 10, max: 10 });
    expect(spread([4])).toEqual({ samples: 1, median: 4, p90: 4, max: 4 });
  });
});

describe('ownerOf', () => {
  it('names the package, scoped or not, or the src folder', () => {
    expect(ownerOf('../../node_modules/@xterm/xterm/lib/xterm.js')).toBe('@xterm/xterm');
    expect(ownerOf('../../node_modules/a/node_modules/marked/lib/marked.esm.js')).toBe('marked');
    expect(ownerOf('../../src/renderer/board/board-view.ts')).toBe('src/renderer/board');
  });
});

describe('source maps', () => {
  it('decodes signed and multi-digit values', () => {
    expect(decodeSegment('AAgBC')).toEqual([0, 0, 16, 1]);
    expect(decodeSegment('D')).toEqual([-1]);
  });

  it('splits each line between sources, and gives a column-only segment to no source', () => {
    // Line 0: source 0 from column 0, unmapped from 4, source 1 from 6, to the end at 10.
    // Line 1: source 1 again (the index runs on) from 0 to 3.
    const bytes = bytesPerSource('AAAA,I,ECAA;AAAA', [10, 3]);
    expect(Object.fromEntries(bytes)).toEqual({ 0: 4, '-1': 2, 1: 7 });
  });
});
