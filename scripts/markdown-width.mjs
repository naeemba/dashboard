// What `pnpm lint` holds a markdown file to: no line wider than WIDTH columns. A review round spent
// rewrapping by hand is a round a machine could have saved. The entry is scripts/markdown-step.mjs.

export const WIDTH = 100;

// Lines that cannot be rewrapped without changing what they say: a code block (fenced, indented, or a
// front matter block of settings), a heading, a table row, a line holding a URL.
const FENCE = /^\s*(`{3,}|~{3,})/;
const INDENTED = /^( {4}|\t)/;
const EXEMPT = /^\s*(\||#)|https?:\/\//;

// The files held to it: every tracked markdown file but the board's (people's text, written by the app
// and the board command) and CHANGELOG.md (written by the release from the pull requests' notes).
export function checkedFile(file) {
  return file.endsWith('.md') && !file.startsWith('.dashboard/') && file !== 'CHANGELOG.md';
}

// Which of `lines` are code, by index: a fence and what it holds, an indented code block, front
// matter. Every markdown check skips them, since a code block quotes text rather than saying it.
export function codeLines(lines) {
  const code = [];
  let fence = null;
  // An indented code block starts after a blank line; a list item's indented second line is prose.
  let indentedCode = false;
  let frontMatter = lines[0] === '---';
  lines.forEach((line, index) => {
    if (frontMatter) {
      frontMatter = index === 0 || line !== '---';
      code.push(true);
      return;
    }
    // A blank line keeps the block as it was.
    if (line.trim() !== '') {
      indentedCode = !fence && INDENTED.test(line) && (indentedCode || lines[index - 1]?.trim() === '');
    }
    const marker = line.match(FENCE)?.[1];
    const inFence = Boolean(fence || marker);
    if (marker && !fence) fence = marker;
    else if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = null;
    code.push(inFence || indentedCode);
  });
  return code;
}

// The lines of `text` wider than `width`, each as its 1-based number and its width in characters.
export function longLines(text, width = WIDTH) {
  const lines = text.split(/\r?\n/);
  const code = codeLines(lines);
  const found = [];
  lines.forEach((line, index) => {
    const length = [...line].length;
    if (!code[index] && !EXEMPT.test(line) && length > width) found.push({ line: index + 1, length });
  });
  return found;
}
