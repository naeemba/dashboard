// The release workflow's file and argument handling around release-notes.mjs.
//
//   node scripts/release-notes-step.mjs changelog <tag> <date> <notes file>    rewrites CHANGELOG.md
//   node scripts/release-notes-step.mjs body <repository> <tag> <notes file> <asset name>...    prints the body
//   node scripts/release-notes-step.mjs whats-new <previous tag> <notes file>    puts the Done cards on top
/* global process, console */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cardsReachedDone, changelogWith, notesWithWhatsNew, releaseBody } from './release-notes.mjs';

const cardsFolder = '.dashboard/board/cards';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });

// The board as it was at a tag. No tag (the first release) or no cards folder there is an empty board.
function cardsAt(tag) {
  if (!tag) return [];
  let names;
  try {
    names = git('ls-tree', '--name-only', `${tag}:${cardsFolder}`).split('\n').filter((name) => name.endsWith('.json'));
  } catch {
    return [];
  }
  return names.map((name) => JSON.parse(git('show', `${tag}:${cardsFolder}/${name}`)));
}

const cardsNow = () =>
  readdirSync(cardsFolder)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(readFileSync(`${cardsFolder}/${name}`, 'utf8')));

const [step, ...rest] = process.argv.slice(2);
if (step === 'changelog') {
  const [tag, date, notesFile] = rest;
  const changelog = existsSync('CHANGELOG.md') ? readFileSync('CHANGELOG.md', 'utf8') : '';
  writeFileSync('CHANGELOG.md', changelogWith(changelog, tag, date, readFileSync(notesFile, 'utf8')));
} else if (step === 'body') {
  const [repository, tag, notesFile, ...assetNames] = rest;
  process.stdout.write(releaseBody(readFileSync(notesFile, 'utf8'), assetNames, repository, tag));
} else if (step === 'whats-new') {
  const [previousTag, notesFile] = rest;
  const cards = cardsReachedDone(cardsAt(previousTag), cardsNow());
  writeFileSync(notesFile, notesWithWhatsNew(readFileSync(notesFile, 'utf8'), cards));
} else {
  console.error(
    'Usage: release-notes-step.mjs changelog <tag> <date> <notes file> | body <repository> <tag> <notes file> <asset>... | whats-new <previous tag> <notes file>',
  );
  process.exit(1);
}
