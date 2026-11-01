// Lower-case Latin letters and digits, every other run turned into one hyphen, none at either end.
// No length cut here: a session name is not cut short, a branch and an exported file name are, each
// to its own length. Shared so main and renderer follow the same rule.
export function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
