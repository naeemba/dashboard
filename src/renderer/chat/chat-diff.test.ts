import { describe, expect, it } from 'vitest';
import { editsHeading, sessionEdits } from './chat-diff';
import type { ChatEntry } from '../../shared/chat/chat-transcript';

const done = { text: 'ok', images: [], isError: false };

function call(name: string, input: Record<string, unknown>, result: typeof done | null = done): ChatEntry {
  return { kind: 'tool', id: name, name, input, result };
}

describe('sessionEdits', () => {
  it('groups the changes by file, in the order each was first touched', () => {
    const files = sessionEdits([
      call('Write', { file_path: '/b.ts', content: 'one\ntwo' }),
      call('Edit', { file_path: '/a.ts', old_string: 'x', new_string: 'y' }),
      call('Edit', { file_path: '/b.ts', old_string: 'one', new_string: 'uno' }),
    ]);
    expect(files.map((file) => file.path)).toEqual(['/b.ts', '/a.ts']);
    expect(editsHeading(files[0])).toBe('/b.ts  +3 −1  2 edits');
  });

  it('leaves out calls that changed nothing: running, failed, and tools that are not edits', () => {
    expect(sessionEdits([
      call('Edit', { file_path: '/a.ts', old_string: 'x', new_string: 'y' }, null),
      call('Edit', { file_path: '/a.ts', old_string: 'x', new_string: 'y' }, { ...done, isError: true }),
      call('Read', { file_path: '/a.ts' }),
      { kind: 'notice', text: 'Stopped.' },
    ])).toEqual([]);
  });
});

describe('editsHeading', () => {
  it('says the path, the lines in and out, and the edits', () => {
    expect(editsHeading({ path: '/a.ts', edits: 1, lines: [{ sign: ' ', text: 'a' }, { sign: '+', text: 'b' }, { sign: '+', text: 'c' }] })).toBe('/a.ts  +2 −0  1 edit');
  });
});
