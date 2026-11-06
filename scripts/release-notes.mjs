// What the release workflow writes: the CHANGELOG.md section and the release body. Kept apart from
// release-notes-step.mjs, which reads files and arguments, so the rules can be tested.

const header = '# Changelog\n';

// The new section goes first, under the header, so the file reads newest first. A changelog that does
// not exist yet (the first release) starts with the header.
export function changelogWith(changelog, tag, date, notes) {
  const rest = changelog.startsWith(header) ? changelog.slice(header.length).replace(/^\n+/, '') : changelog;
  const section = `## ${tag} (${date})\n\n${notes.trim()}\n`;
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

// README.md's Install section says the same; change both together.
export const unsignedSection = `## Unsigned builds

These builds are not signed, so each system warns once before the first launch.

- macOS: Control-click Dashboard.app in Applications and choose Open, then Open again. On macOS 15 and later, open it once, then go to System Settings → Privacy & Security and click Open Anyway.
- Windows: SmartScreen says "Windows protected your PC". Click More info, then Run anyway.
- Linux: nothing to do.
`;

export function releaseBody(notes, assetNames, repository, tag) {
  return [downloadsSection(assetNames, repository, tag), unsignedSection, notes.trim() + '\n'].join('\n');
}
