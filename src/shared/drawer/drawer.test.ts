import { describe, expect, it } from 'vitest';
import { docKind } from './drawer';

describe('docKind', () => {
  it('names markdown, YAML and JSON by extension, any case, and nothing else', () => {
    expect(['a/README.md', 'p.YAML', 'p.yml', '.claude/settings.json', 'shot.png', 'Makefile', 'a.md/x'].map(docKind))
      .toEqual(['markdown', 'yaml', 'yaml', 'json', null, null, null]);
  });
});
