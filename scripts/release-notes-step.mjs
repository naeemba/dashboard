// The release workflow's file and argument handling around release-notes.mjs.
//
//   node scripts/release-notes-step.mjs changelog <tag> <date> <notes file>    rewrites CHANGELOG.md
//   node scripts/release-notes-step.mjs body <repository> <tag> <notes file> <asset name>...    prints the body
/* global process, console */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { changelogWith, releaseBody } from './release-notes.mjs';

const [step, ...rest] = process.argv.slice(2);
if (step === 'changelog') {
  const [tag, date, notesFile] = rest;
  const changelog = existsSync('CHANGELOG.md') ? readFileSync('CHANGELOG.md', 'utf8') : '';
  writeFileSync('CHANGELOG.md', changelogWith(changelog, tag, date, readFileSync(notesFile, 'utf8')));
} else if (step === 'body') {
  const [repository, tag, notesFile, ...assetNames] = rest;
  process.stdout.write(releaseBody(readFileSync(notesFile, 'utf8'), assetNames, repository, tag));
} else {
  console.error('Usage: release-notes-step.mjs changelog <tag> <date> <notes file> | body <repository> <tag> <notes file> <asset>...');
  process.exit(1);
}
