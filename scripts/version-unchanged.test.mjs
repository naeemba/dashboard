import { describe, expect, it } from 'vitest';
import { versionRefusal } from './version-unchanged.mjs';

describe('versionRefusal', () => {
  it('lets a pull request through when its version is the base version', () => {
    expect(versionRefusal('2.4.0', '2.4.0')).toBe('');
  });

  it('refuses a bump, naming both versions and the one to put back', () => {
    expect(versionRefusal('2.4.0', '2.5.0')).toBe(
      'package.json version moved from 2.4.0 to 2.5.0. A card leaves it alone; only the Release workflow bumps it (workflow-rule-3). Put it back to 2.4.0.',
    );
  });
});
