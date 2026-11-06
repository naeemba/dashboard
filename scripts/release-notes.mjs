// What the release workflow writes: the CHANGELOG.md section and the release body. Kept apart from
// release-notes-step.mjs, which reads files and arguments, so the rules can be tested.

const header = '# Changelog\n';

// The new section goes first, under the header, so the file reads newest first. A changelog that does
// not exist yet (the first release) starts with the header.
export function changelogWith(changelog, tag, date, notes) {
  const rest = changelog.startsWith(header) ? changelog.slice(header.length).replace(/^\n+/, '') : changelog;
  // GitHub's notes open with `## What's Changed`; one level down nests them under their version.
  const section = `## ${tag} (${date})\n\n${notes.trim().replace(/^## /gm, '### ')}\n`;
  return `${header}\n${section}${rest ? `\n${rest}` : ''}`;
}

// One line per platform, each link one of that platform's files. Squirrel's RELEASES and .nupkg are its
// update feed, not something a person downloads, so they get no link.
const platforms = [
  { name: 'macOS (Apple silicon)', kinds: [['dmg', /\.dmg$/], ['zip', /-darwin-.*\.zip$/]] },
  { name: 'Windows (x64)', kinds: [['installer', /Setup\.exe$/]] },
  { name: 'Linux (x64)', kinds: [['deb', /\.deb$/], ['rpm', /\.rpm$/], ['zip', /-linux-.*\.zip$/]] },
];

export function downloadsSection(assetNames, repository, tag) {
  const link = (name) => `https://github.com/${repository}/releases/download/${tag}/${encodeURIComponent(name)}`;
  const lines = platforms.flatMap(({ name, kinds }) => {
    const links = kinds.flatMap(([label, pattern]) =>
      assetNames.filter((asset) => pattern.test(asset)).map((asset) => `[${label}](${link(asset)})`),
    );
    return links.length === 0 ? [] : [`- ${name}: ${links.join(' · ')}`];
  });
  return `## Downloads\n\n${lines.join('\n')}\n`;
}

// The steps themselves live once, in README.md's Install section.
function unsignedSection(repository) {
  return `## Unsigned builds

These builds are not signed, so macOS and Windows warn once before the first launch. [Install](https://github.com/${repository}#install) says what to click.
`;
}

export function releaseBody(notes, assetNames, repository, tag) {
  return [downloadsSection(assetNames, repository, tag), unsignedSection(repository), notes.trim() + '\n'].join('\n');
}
