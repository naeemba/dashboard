import { describe, expect, it } from 'vitest';
import { pickerRows } from './picker';
import type { Project } from '../../shared/app/bridge';

const none = { connectedTo: null, lastAddress: '' };
const project = (name: string, path: string): Project => ({ name, path, missing: false });

describe('pickerRows', () => {
  it('always ends with the new-project row, even when nothing matches', () => {
    const rows = pickerRows([project('api', '/code/api')], 'zzz', none);
    expect(rows.at(-2)?.choice).toEqual({ kind: 'open', path: null });
    expect(rows.every((row) => row.choice.kind !== 'open' || row.choice.path === null)).toBe(true);
  });

  it('sorts a tighter match ahead of a looser one', () => {
    const rows = pickerRows([project('dashboard', '/code/dashboard'), project('dab', '/code/dab')], 'dab', none);
    expect(rows[0].choice).toEqual({ kind: 'open', path: '/code/dab' });
  });

  it('keeps the input order for projects the query cannot separate', () => {
    const rows = pickerRows([project('api', '/live/api'), project('api', '/old/api')], 'api', none);
    expect(rows.slice(0, 2).map((row) => row.choice)).toEqual([
      { kind: 'open', path: '/live/api' }, { kind: 'open', path: '/old/api' },
    ]);
  });

  it('offers every project when the search is empty', () => {
    const rows = pickerRows([project('api', '/code/api'), project('web', '/code/web')], '', none);
    expect(rows.map((row) => row.name).slice(0, 3)).toEqual(['api', 'web', 'Open a new project…']);
  });
});

describe('connect rows', () => {
  it('offers to connect when not connected', () => {
    const rows = pickerRows([], '', none);
    expect(rows.map((row) => row.choice)).toEqual([{ kind: 'open', path: null }, { kind: 'connect' }]);
  });

  it('offers the last host as the first row when there is one', () => {
    const rows = pickerRows([project('api', '/code/api')], '', { connectedTo: null, lastAddress: '10.0.0.2:7777' });
    expect(rows.map((row) => row.choice)).toEqual([
      { kind: 'reconnect', address: '10.0.0.2:7777' }, { kind: 'open', path: '/code/api' },
      { kind: 'open', path: null }, { kind: 'connect' },
    ]);
  });

  it('leads with the matches once something is typed', () => {
    const rows = pickerRows([project('api', '/code/api')], 'api', { connectedTo: null, lastAddress: '10.0.0.2:7777' });
    expect(rows.map((row) => row.choice)).toEqual([
      { kind: 'open', path: '/code/api' }, { kind: 'open', path: null },
      { kind: 'reconnect', address: '10.0.0.2:7777' }, { kind: 'connect' },
    ]);
  });

  it('offers only to disconnect while connected', () => {
    const rows = pickerRows([], '', { connectedTo: '10.0.0.2:7777', lastAddress: '10.0.0.2:7777' });
    expect(rows.map((row) => row.choice)).toEqual([
      { kind: 'open', path: null }, { kind: 'disconnect', address: '10.0.0.2:7777' },
    ]);
  });

  it('keeps the host rows whatever the search says', () => {
    const rows = pickerRows([project('api', '/code/api')], 'zzz', none);
    expect(rows.map((row) => row.choice)).toEqual([{ kind: 'open', path: null }, { kind: 'connect' }]);
  });
});
