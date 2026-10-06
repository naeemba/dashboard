// Every icon the app draws, from Lucide. Named here rather than imported at each call site so the
// whole set is one list to read, and so a screen asks for `icon('rocket')` without knowing which
// library drew it. Each one is stroked in currentColor and takes the colour of the text around it.
import {
  Bitcoin, Calendar, ChevronDown, ChevronRight, CircleCheck, CircleDashed, CircleDot, Cloud,
  CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Coins, Columns3, CornerLeftUp, createElement,
  DollarSign, Droplet, Eye, FilePen, Folder, FolderPlus, GitBranch, Inbox, GitPullRequest, Keyboard, LayoutDashboard,
  MessageSquare, NotebookPen, Rocket, Settings, Square, SquareCheck, SquareTerminal, Sun,
  Terminal, Trees,
  type IconNode,
} from 'lucide';
import { BACKLOG_COLUMN, DONE_COLUMN, REVIEW_COLUMN, SHIP_COLUMN } from './board';
import type { Mode } from './modes';

const ICONS = {
  backlog: Inbox,
  bitcoin: Bitcoin,
  board: Columns3,
  calendar: Calendar,
  checked: SquareCheck,
  cloud: Cloud,
  cloudSun: CloudSun,
  collapse: ChevronDown,
  coins: Coins,
  command: SquareTerminal,
  comments: MessageSquare,
  doing: CircleDot,
  dollar: DollarSign,
  done: CircleCheck,
  drizzle: CloudDrizzle,
  droplet: Droplet,
  editor: FilePen,
  expand: ChevronRight,
  fog: CloudFog,
  folder: Folder,
  folderPlus: FolderPlus,
  branch: GitBranch,
  general: LayoutDashboard,
  keyboard: Keyboard,
  notes: NotebookPen,
  parent: CornerLeftUp,
  pullRequest: GitPullRequest,
  rain: CloudRain,
  review: Eye,
  settings: Settings,
  ship: Rocket,
  snow: CloudSnow,
  storm: CloudLightning,
  sun: Sun,
  terminal: Terminal,
  todo: CircleDashed,
  unchecked: Square,
  worktrees: Trees,
} satisfies Record<string, IconNode>;

export type IconName = keyof typeof ICONS;

// Built once per name and cloned after: a board redraw on every arrow key asks for an icon per badge.
const built = new Map<IconName, HTMLElement>();

export function icon(name: IconName): HTMLElement {
  let template = built.get(name);
  if (!template) {
    template = document.createElement('span');
    template.className = 'icon';
    template.append(createElement(ICONS[name], { 'aria-hidden': 'true' }));
    built.set(name, template);
  }
  return template.cloneNode(true) as HTMLElement;
}

// A line of text led by an icon, the shape every badge on a card and every dialog title takes. The
// text sits in a span of its own so a stylesheet can end it in an ellipsis: in a flex row, bare text
// never shrinks and is cut mid-letter instead.
export function labelled(
  tag: 'p' | 'h2', className: string, name: IconName, ...text: (string | Node)[]
): HTMLElement {
  const element = document.createElement(tag);
  element.className = className;
  const label = document.createElement('span');
  label.append(...text);
  element.append(icon(name), label);
  return element;
}

// Each screen's glyph, wherever it is named: the manager's tab and its sections, a project's views.
// Complete on purpose, so a new mode does not compile until it has one.
export const MODE_GLYPHS: Record<Mode, IconName> = {
  terminals: 'terminal', nvim: 'editor', board: 'board', notes: 'notes', manager: 'general', command: 'command',
};

// A button holding an icon and a name, the shape every bar of tabs in the app is built from.
export function iconButton(className: string, glyph: IconName, text: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  const name = document.createElement('span');
  name.textContent = text;
  button.append(icon(glyph), name);
  button.addEventListener('click', onClick);
  return button;
}

// A board column's glyph, by what the column means rather than where it sits. Column names are free
// text, so a column this list does not know gets the plain board icon.
const COLUMN_GLYPHS: Record<string, IconName> = {
  [BACKLOG_COLUMN.toLowerCase()]: 'backlog', todo: 'todo', doing: 'doing', [SHIP_COLUMN.toLowerCase()]: 'ship', [REVIEW_COLUMN.toLowerCase()]: 'review',
  [DONE_COLUMN.toLowerCase()]: 'done',
};

export function columnIcon(name: string): IconName {
  return COLUMN_GLYPHS[name.trim().toLowerCase()] ?? 'board';
}
