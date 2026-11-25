import { it } from 'vitest';

// A test whose expected values are POSIX path literals (/work/app, ~/notes) skips on Windows, where
// node:path builds them with backslashes and a drive (workflow-rule-6). Card 43ceddd8 makes those
// tests portable instead; until then every one of them takes this, rather than a copy of its own.
export const posixPathsOnly = it.skipIf(process.platform === 'win32');
