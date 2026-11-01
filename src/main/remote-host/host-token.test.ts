import { describe, expect, it } from 'vitest';
import { ensureHostToken } from './host-token';
import { defaultSettings } from '../../shared/settings/settings';

describe('ensureHostToken', () => {
  it('generates a token once', () => {
    const first = ensureHostToken(defaultSettings(false), () => 'fresh');
    expect(first.generated).toBe(true);
    expect(first.settings.host.token).toBe('fresh');
    const second = ensureHostToken(first.settings, () => 'again');
    expect(second.generated).toBe(false);
    expect(second.settings).toBe(first.settings);
  });
});
