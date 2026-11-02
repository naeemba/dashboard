// Where a streaming reply can be cut so the part before it is drawn once and only the rest is drawn
// again each frame. A cut sits at the start of a line after a blank line, outside a code fence, where
// that line cannot carry on the block above it: not indented (a list item's next paragraph, indented
// code), not a list item (a loose list), not a quote. Markdown drawn in two pieces at such a cut is the
// same HTML as drawn whole.
//
// Null means do not cut this reply at all and draw it whole every frame, as before: a link definition
// (`[name]: url`) applies to the whole text, so a link above it would show unlinked; a line opening
// raw HTML can run on past a blank line.
//
// `from` is an earlier cut, or 0, so each frame reads only the text past the part already drawn.

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const WHOLE = /^ {0,3}(<|\[[^\]]+\]:)/;
const CARRIES_ON = /^(\s|[-*+>]|\d)/;

export function liveCut(text: string, from = 0): number | null {
  let fence = '';
  let afterBlank = false;
  let cut = from;
  for (let start = from; start < text.length;) {
    const newline = text.indexOf('\n', start);
    const end = newline === -1 ? text.length : newline;
    const line = text.slice(start, end);
    const marker = FENCE.exec(line)?.[1];
    if (fence) {
      const closes = marker !== undefined && marker[0] === fence[0] && marker.length >= fence.length
        && line.slice(line.indexOf(marker) + marker.length).trim() === '';
      if (closes) fence = '';
    } else {
      if (WHOLE.test(line)) return null;
      const blank = line.trim() === '';
      if (afterBlank && !blank && !CARRIES_ON.test(line)) cut = start;
      if (marker) fence = marker;
      afterBlank = blank;
    }
    start = end + 1;
  }
  return cut;
}
