import { describe, expect, it } from 'vitest';
import { SNAPSHOT_LIMIT, snapshotOf, type AXNode } from './page-snapshot';

const node = (role: string, name: string, backendDOMNodeId: number, more: Partial<AXNode> = {}): AXNode => ({
  role: { value: role }, name: { value: name }, backendDOMNodeId, ...more,
});

describe('snapshotOf', () => {
  it('keeps only what can be clicked or typed in, each with a ref to its node', () => {
    const made = snapshotOf(2, [
      node('RootWebArea', 'Example', 1),
      node('heading', 'Sign in', 2),
      node('textbox', 'Email', 3, { value: { value: 'me@example.com' }, properties: [{ name: 'focused', value: { value: true } }] }),
      node('checkbox', 'Remember me', 4, { properties: [{ name: 'checked', value: { value: 'false' } }] }),
      node('button', 'Sign  in', 5, { properties: [{ name: 'disabled', value: { value: true } }] }),
      node('link', 'Hidden', 6, { ignored: true }),
      { role: { value: 'button' }, name: { value: 'No node' } },
    ]);
    expect(made.text.split('\n')).toEqual([
      'tab 2: 3 elements',
      'e1 textbox "Email" = "me@example.com" focused',
      'e2 checkbox "Remember me"',
      'e3 button "Sign in" disabled',
    ]);
    expect([...made.refs]).toEqual([['e1', 3], ['e2', 4], ['e3', 5]]);
  });

  it('cuts a long name, and says how many it left past the limit', () => {
    const many = Array.from({ length: SNAPSHOT_LIMIT + 2 }, (_, place) => node('link', 'x'.repeat(100), place + 1));
    const lines = snapshotOf(1, many).text.split('\n');
    expect(lines[1]).toBe(`e1 link "${'x'.repeat(79)}…"`);
    expect(lines.at(-1)).toBe(`… 2 more past the first ${SNAPSHOT_LIMIT}; \`browser read\` for the text`);
  });

  it('lists each file input as a file, the one the tree shows and the one the page hides', () => {
    const made = snapshotOf(2, [
      node('button', 'Choose File', 3),
      node('button', 'Upload resume', 4),
      node('button', '', 5, { ignored: true }),
    ], [{ node: 3, name: 'cover' }, { node: 5, name: 'resume' }]);
    expect(made.text.split('\n')).toEqual([
      'tab 2: 3 elements',
      'e1 file "Choose File"',
      'e2 button "Upload resume"',
      'e3 file "resume"',
    ]);
    expect([...made.refs]).toEqual([['e1', 3], ['e2', 4], ['e3', 5]]);
  });

  it('lists a file input past the limit', () => {
    const many = Array.from({ length: SNAPSHOT_LIMIT + 1 }, (_, place) => node('button', 'b', place + 1));
    const lines = snapshotOf(1, many, [{ node: 9999, name: 'resume' }]).text.split('\n');
    expect(lines.slice(-2)).toEqual([`e${SNAPSHOT_LIMIT + 1} file "resume"`, `… 1 more past the first ${SNAPSHOT_LIMIT}; \`browser read\` for the text`]);
  });

  it('says a page has nothing to act on', () => {
    expect(snapshotOf(1, [node('heading', 'Hi', 1)]).text).toBe('tab 1 has nothing to click or type in');
  });
});
