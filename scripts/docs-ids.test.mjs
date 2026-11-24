import { describe, expect, it } from 'vitest';
import { idProblems } from './docs-ids.mjs';

describe('idProblems', () => {
  it('passes headings with one id each, and a citation of one', () => {
    expect(idProblems('## board-rule-1: A\n\n## board-rule-2: B\n\nSee board-rule-1.\n')).toEqual([]);
  });

  it('names a second heading with an id, and the line that has it first', () => {
    expect(idProblems('## board-decision-3: A\n\ntext\n### board-decision-3: B\n')).toEqual([
      { line: 4, problem: 'board-decision-3 also heads line 1' },
    ]);
  });

  it('names a -next id in a heading or a citation, on a CRLF file too', () => {
    expect(idProblems('## remote-host-rule-next: A\r\nkept (board-decision-next).\r\n')).toEqual([
      { line: 1, problem: 'remote-host-rule-next is not numbered yet' },
      { line: 2, problem: 'board-decision-next is not numbered yet' },
    ]);
  });

  it('leaves the pattern itself, written with a placeholder, alone', () => {
    expect(idProblems('Write it as `<feature>-decision-next` until main.\n')).toEqual([]);
  });

  it('skips an id quoted in a fenced or indented code block', () => {
    const fenced = '```markdown\n## board-decision-8: A\n```\n';
    const indented = '\n    (board-rule-next)\n';
    expect(idProblems(`## board-decision-8: A\n\n${fenced}${fenced}${indented}`)).toEqual([]);
  });
});
