import { oneLine } from './page-reader';

// `browser snapshot`: the page's accessibility tree trimmed to what can be clicked or typed in, each
// with a short ref (e1, e2) that click, type and press name it by. Made from Chromium's own tree
// (Accessibility.getFullAXTree), whose roles and names are what a screen reader would say.

// The fields of a DevTools AXNode read here; everything else it carries is left.
type AXValue = { value?: unknown };
export type AXNode = {
  ignored?: boolean;
  role?: AXValue;
  name?: AXValue;
  value?: AXValue;
  properties?: { name: string; value: AXValue }[];
  backendDOMNodeId?: number;
};

const INTERACTIVE = new Set([
  'button', 'link', 'textbox', 'searchbox', 'checkbox', 'radio', 'combobox', 'listbox', 'option', 'menuitem',
  'menuitemcheckbox', 'menuitemradio', 'tab', 'switch', 'slider', 'spinbutton', 'treeitem',
]);

// The states worth a word beside the name, as the tree says them.
const STATES = ['checked', 'selected', 'expanded', 'disabled', 'focused'];

// A long page has hundreds of links; past this many the snapshot says how many it left out.
export const SNAPSHOT_LIMIT = 300;
const NAME_LIMIT = 80;

const text = (value: AXValue | undefined): string => (typeof value?.value === 'string' ? oneLine(value.value) : '');

function cut(name: string): string {
  return name.length <= NAME_LIMIT ? name : `${name.slice(0, NAME_LIMIT - 1).trimEnd()}…`;
}

type Snapshot = { text: string; refs: Map<string, number> };

export function snapshotOf(id: number, nodes: readonly AXNode[]): Snapshot {
  const lines: string[] = [];
  const refs = new Map<string, number>();
  let left = 0;
  for (const node of nodes) {
    const role = text(node.role);
    if (node.ignored === true || node.backendDOMNodeId === undefined || !INTERACTIVE.has(role)) continue;
    if (refs.size === SNAPSHOT_LIMIT) {
      left++;
      continue;
    }
    const ref = `e${refs.size + 1}`;
    refs.set(ref, node.backendDOMNodeId);
    const value = text(node.value);
    const states = (node.properties ?? [])
      .filter((property) => STATES.includes(property.name) && property.value.value !== false && property.value.value !== 'false')
      .map((property) => (property.value.value === 'mixed' ? `${property.name}=mixed` : property.name));
    lines.push([ref, role, JSON.stringify(cut(text(node.name))), value === '' ? '' : `= ${JSON.stringify(cut(value))}`, ...states]
      .filter((part) => part !== '').join(' '));
  }
  if (lines.length === 0) return { text: `tab ${id} has nothing to click or type in`, refs };
  const more = left === 0 ? [] : [`… ${left} more past the first ${SNAPSHOT_LIMIT}; \`browser read\` for the text`];
  return { text: [`tab ${id}: ${refs.size} elements`, ...lines, ...more].join('\n'), refs };
}
