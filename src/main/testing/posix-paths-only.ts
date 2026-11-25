import { it } from 'vitest';

// A test whose expected values are POSIX path literals skips on Windows, which reads /work/api as one
// on the current drive, D:\work\api, so the paths it expects never come back (workflow-rule-6). Card
// 43ceddd8 makes those tests portable instead; until then every one of them takes this, not a copy.
export const posixPathsOnly = it.skipIf(process.platform === 'win32');
