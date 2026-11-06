import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { channels } from './channels';
import { LOCAL_SCREEN } from '../../shared/remote-host/screens';
import { SESSION_FILE } from './session';
import { registerWhatsNew } from './whats-new-store';

const directories: string[] = [];
afterEach(() => { directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })); });

function store(session = false) {
  const userData = mkdtempSync(path.join(tmpdir(), 'whats-new-store-'));
  directories.push(userData);
  if (session) writeFileSync(path.join(userData, SESSION_FILE), '{}');
  const table = channels();
  registerWhatsNew(table, userData);
  const record = (build: string) => table.invoke(LOCAL_SCREEN, 'whats-new:record', [{ build, newest: null }]);
  return { userData, record };
}

describe('whats-new:record', () => {
  it('answers no record and no history on a fresh folder, then the build it was handed', async () => {
    const { record } = store();
    expect(await record('one')).toEqual({ shown: null, history: false });
    expect(await record('two')).toEqual({ shown: { build: 'one', newest: null }, history: false });
  });

  it('says a folder with a saved session has history', async () => {
    const { record } = store(true);
    expect(await record('one')).toEqual({ shown: null, history: true });
  });

  it('reads history before the launch writes its first session, so a first install stays one', async () => {
    const { userData, record } = store();
    writeFileSync(path.join(userData, SESSION_FILE), '{}');
    expect(await record('one')).toEqual({ shown: null, history: false });
  });

  it('reads a record that does not parse as none, and writes over it', async () => {
    const { userData, record } = store();
    writeFileSync(path.join(userData, 'whats-new.json'), '{ not json');
    expect(await record('one')).toEqual({ shown: null, history: false });
    expect(await record('two')).toEqual({ shown: { build: 'one', newest: null }, history: false });
  });
});
