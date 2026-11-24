// What `pnpm lint` holds a markdown file's docs ids to (docs/README.md): a heading's id
// (`## board-decision-3: ...`) heads one entry only, and no id is left as `<feature>-<kind>-next`,
// the name a worker writes for a new entry until it numbers it at the last merge of main. Two
// cards that each numbered their entry from the same main both say `board-decision-7`, and a
// `-next` that merged is an id nothing can cite. The entry is scripts/markdown-step.mjs.

const ID = String.raw`[a-z]+(?:-[a-z]+)*-(?:rule|decision)-`;
const NEXT = new RegExp(String.raw`\b${ID}next\b`, 'g');
const HEADING = new RegExp(String.raw`^#{2,}\s+(${ID}\d+)\b`);

// The lines of `text` with a bad id, each as its 1-based number and what is wrong with it.
export function idProblems(text) {
  const headed = new Map();
  const found = [];
  text.split(/\r?\n/).forEach((line, index) => {
    for (const [id] of line.matchAll(NEXT)) found.push({ line: index + 1, problem: `${id} is not numbered yet` });
    const id = line.match(HEADING)?.[1];
    if (!id) return;
    if (headed.has(id)) found.push({ line: index + 1, problem: `${id} also heads line ${headed.get(id)}` });
    else headed.set(id, index + 1);
  });
  return found;
}
