import { describe, expect, it } from 'vitest';
import { pickerRows } from './picker';
import type { Project } from './projects';

const project = (name: string, path: string): Project => ({ name, path, missing: false });

describe('pickerRows', () => {
  it('always ends with the new-project row, even when nothing matches', () => {
    const rows = pickerRows([project('api', '/code/api')], 'zzz');
    expect(rows).toHaveLength(1);
    expect(rows[0].choice).toBeNull();
  });

  it('sorts a tighter match ahead of a looser one', () => {
    const rows = pickerRows([project('dashboard', '/code/dashboard'), project('dab', '/code/dab')], 'dab');
    expect(rows[0].choice).toBe('/code/dab');
  });

  it('keeps the input order for projects the query cannot separate', () => {
    const rows = pickerRows([project('api', '/live/api'), project('api', '/old/api')], 'api');
    expect(rows.map((row) => row.choice)).toEqual(['/live/api', '/old/api', null]);
  });

  it('offers every project when the search is empty', () => {
    const rows = pickerRows([project('api', '/code/api'), project('web', '/code/web')], '');
    expect(rows.map((row) => row.name)).toEqual(['api', 'web', 'Open a new project…']);
  });
});
