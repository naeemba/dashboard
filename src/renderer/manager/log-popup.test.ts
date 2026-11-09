import { describe, expect, it } from 'vitest';
import { parseLogLine, type LogEntry } from '../../shared/app/log-entry';
import { copiedEntry, shownEntry, stackLines } from './log-popup';
import { LOG_FIXTURE_LINES } from './log-popup.fixture';

const entries = LOG_FIXTURE_LINES.map(parseLogLine).filter((entry): entry is LogEntry => entry !== undefined);

describe('the log popup', () => {
  it('reads every whole line of the fixture and skips the two broken ones', () => {
    expect(entries).toHaveLength(LOG_FIXTURE_LINES.length - 2);
  });

  it('shows an older entry as its five fields, row order first, and nothing else', () => {
    const shown = JSON.parse(JSON.stringify(shownEntry(entries[1])));
    expect(Object.keys(shown)).toEqual(['time', 'level', 'kind', 'project', 'message']);
    expect(Object.keys(JSON.parse(JSON.stringify(shownEntry(entries[0]))))).toEqual(['time', 'level', 'kind', 'message']);
  });

  it('keeps a newer entry\'s source, build and context', () => {
    expect(shownEntry(entries[5])).toMatchObject({ source: 'main', build: '2.45.0+cc807141cc73', context: { pane: 1 } });
  });

  it('shows a stack and its cause\'s stack one frame to a line', () => {
    const shown = shownEntry(entries[6]);
    expect(shown).toMatchObject({
      channel: 'board:write', action: 'board.move',
      error: {
        code: 'EACCES',
        stack: ['Error: EACCES: permission denied', 'at writeCard (board-store.js:40:11)', 'at moveCard (board.js:88:5)'],
        cause: { message: 'read-only folder', stack: ['Error: read-only folder', 'at open (fs.js:1:1)'] },
      },
    });
  });

  it('copies the entry exactly as it was read', () => {
    for (const entry of entries) expect(JSON.parse(copiedEntry(entry))).toEqual(JSON.parse(JSON.stringify(entry)));
    expect(copiedEntry(entries[6])).toContain('"stack": "Error: EACCES');
  });

  it('drops blank lines and indents from a stack', () => {
    expect(stackLines('Error: x\n\n    at a\n')).toEqual(['Error: x', 'at a']);
  });
});
