import { describe, expect, it } from 'vitest';
import { unacceptedLine, versionRefusal } from './app-handshake';

describe('versionRefusal', () => {
  it('answers only the app’s own build', () => {
    expect(versionRefusal('1.4.0+372685450abc', '1.4.0+372685450abc')).toBeUndefined();
  });

  // Same release, another commit: still another build, and the two can read a request differently.
  it('refuses another commit of the same release, naming both builds', () => {
    expect(versionRefusal('1.4.0+372685450abc', '1.4.0+aaaaaaaaaaaa'))
      .toBe('this command is v1.4.0+aaaaaaaaaaaa and the running Dashboard is v1.4.0+372685450abc — restart the app');
  });

  // A command built before requests carried a stamp sends none, or something that is not one.
  it('calls a command with no stamp an older build', () => {
    expect(versionRefusal('1.4.0+372685450abc', undefined)).toContain('this command is an older build');
    expect(versionRefusal('1.4.0+372685450abc', 7)).toContain('this command is an older build');
  });
});

describe('unacceptedLine', () => {
  it('says how long it waited and what to do', () => {
    expect(unacceptedLine(5000)).toContain('within 5 seconds');
    expect(unacceptedLine(5000)).toContain('needs a restart');
  });
});
