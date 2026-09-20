import { describe, expect, it } from 'vitest';
import { APP_VERSION } from './version';

describe('APP_VERSION', () => {
  // The import is the whole of this module, and the way it fails is silent: a bundler that does not
  // hand back a named export from JSON leaves `version` undefined, nothing throws, and the foot of
  // the manager page reads `vundefined` — which looks like a version until you try to compare it
  // with main.
  it('is the three numbers package.json holds', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
