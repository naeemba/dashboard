import net from 'node:net';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { awaitAcceptance, unacceptedLine, versionRefusal } from './app-handshake';
import { temporaryFolder } from '../testing/temporary-folder';

describe('versionRefusal', () => {
  it('answers only the app’s own build', () => {
    expect(versionRefusal('1.4.0+372685450abc', '1.4.0+372685450abc', ['list'])).toBeUndefined();
  });

  // Same release, another commit: still another build, and the two can read a request differently.
  it('refuses another commit of the same release, naming both builds', () => {
    expect(versionRefusal('1.4.0+372685450abc', '1.4.0+aaaaaaaaaaaa', ['list']))
      .toBe('this command is v1.4.0+aaaaaaaaaaaa and the running Dashboard is v1.4.0+372685450abc — restart the app');
  });

  // A command built before requests carried a stamp sends none, or something that is not one.
  it('calls a command with no stamp an older build', () => {
    expect(versionRefusal('1.4.0+372685450abc', undefined, ['list'])).toContain('this command is an older build');
    expect(versionRefusal('1.4.0+372685450abc', 7, ['list'])).toContain('this command is an older build');
  });

  // A worker's hooks run notify after every rebuild until the restart; a refusal there reaches nobody,
  // and the worker's pane would never say it finished.
  it('lets notify through from any build', () => {
    expect(versionRefusal('1.4.0+372685450abc', '1.4.0+aaaaaaaaaaaa', ['notify', '2:3', 'done'])).toBeUndefined();
    expect(versionRefusal('1.4.0+372685450abc', undefined, ['notify', '2:3', 'done'])).toBeUndefined();
  });
});

describe('unacceptedLine', () => {
  it('says how long it waited and what to do', () => {
    expect(unacceptedLine(5000)).toContain('within 5 seconds');
    expect(unacceptedLine(5000)).toContain('needs a restart');
    expect(unacceptedLine(5000)).toContain('may still act on the request');
  });
});

describe('awaitAcceptance', () => {
  // A connection that fails closes at once; without the close stopping the timer the command would
  // print its failure and then sit out the rest of the timeout before exiting.
  it('stops timing a connection that has closed', async () => {
    const folder = temporaryFolder('handshake-test-');
    const silent = vi.fn();
    const connection = net.connect(path.join(folder, 'none.sock'));
    connection.on('error', () => undefined);
    awaitAcceptance(connection, 50, silent);
    await new Promise((resolve) => connection.once('close', resolve));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(silent).not.toHaveBeenCalled();
  });
});
