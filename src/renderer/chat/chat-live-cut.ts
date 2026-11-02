// Where a streaming reply can be cut so the part before it is drawn once and only the rest is drawn
// again each frame. A cut sits at the start of a line after a blank line, outside a code fence, where
// that line cannot carry on the block above it: not indented (a list item's next paragraph, indented
// code), not a list item (a loose list), not a quote. Markdown drawn in two pieces at such a cut is the
// same HTML as drawn whole.
//
// Null means do not cut this reply at all and draw it whole every frame, as before: a link definition
// (`[name]: url`), even in a list item or a quote, applies to the whole text, so a link above it would
// show unlinked; a comment or a `<pre>`, `<script>`, `<style>` or `<textarea>` block runs on past a
// blank line. A fence opened in a list item or a quote, or a fenced line less indented than its
// opener, is one this scanner cannot follow: the container may close it where a top-level fence runs on.
//
// `from` is an earlier cut, or 0, so each frame reads only the text past the part already drawn.

// A backtick fence's info string cannot hold a backtick.
const FENCE = /^ {0,3}(`{3,}(?=[^`]*$)|~{3,})/;
// A list item or quote marker. Each starts with a character a space is not, so a run of spaces has one
// way to match.
const CONTAINER = String.raw`(([-*+]|\d+[.)])\s+|>\s*)`;
const WHOLE = new RegExp(
  String.raw`^(\s*${CONTAINER}*\[[^\]]+\]:| {0,3}<(!|\?|(script|pre|style|textarea)(\s|>|$)))`,
  'i',
);
const CONTAINED_FENCE = new RegExp(String.raw`^\s*${CONTAINER}+(\`{3,}|~{3,})`);
// A digit carries on even alone: half arrived, it may yet be `2.`.
const CARRIES_ON = /^(\s|>|\d|[-*+](\s|$))/;

export function liveCut(text: string, from = 0): number | null {
  let fence = '';
  let fenceIndent = 0;
  let afterBlank = false;
  let cut = from;
  for (let start = from; start < text.length;) {
    const newline = text.indexOf('\n', start);
    const end = newline === -1 ? text.length : newline;
    const line = text.slice(start, end);
    const marker = FENCE.exec(line)?.[1];
    const indent = line.length - line.trimStart().length;
    if (fence) {
      if (line.trim() !== '' && indent < fenceIndent) return null;
      if (line.trim() === marker && marker[0] === fence[0] && marker.length >= fence.length) fence = '';
    } else {
      if (WHOLE.test(line) || CONTAINED_FENCE.test(line)) return null;
      const blank = line.trim() === '';
      if (afterBlank && !blank && !CARRIES_ON.test(line)) cut = start;
      if (marker) {
        fence = marker;
        fenceIndent = indent;
      }
      afterBlank = blank;
    }
    start = end + 1;
  }
  return cut;
}

export type LiveStep = {
  // The text drawn once is no longer a start of this one: a new block, or one that cannot be cut.
  clear: boolean;
  // Newly settled text to draw once, after what was settled before.
  settle: string;
  // What is redrawn this frame.
  tail: string;
  settled: number;
};

// One frame of the streaming block, given the text shown last frame and how much of it is settled.
export function liveStep(shown: string, settled: number, text: string): LiveStep {
  const from = text.startsWith(shown) ? settled : 0;
  const cut = liveCut(text, from);
  const start = cut === null ? 0 : from;
  const end = cut ?? 0;
  return { clear: start !== settled, settle: text.slice(start, end), tail: text.slice(Math.max(start, end)), settled: Math.max(start, end) };
}
