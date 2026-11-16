import type { Action } from '../../shared/keys/actions';
import { recentActivity } from './board-summary';
import { clampIndex, heldIndex } from '../../shared/app/clamp-index';
import { formatSize } from '../../shared/ship/git-worktrees';
import {
  alertSummary, answerTarget, canOpen, groupOpenings, lineKey, managerLines, paneAge, queueLength, queueRefresh,
  noPaneText, removableWorktree, slotOfLine, type ManagerLine, type ManagerRow, type WorktreeTarget,
} from '../../shared/manager/manager';
import { createActivity, createOverview } from './manager-panels';
import { createRow, dirtyText, groupHead, writeLine } from './manager-rows';
import { putChildren, writeHidden } from './dom-writes';
import { NEED_LABELS, nextLanding, needsYou, type Need } from '../../shared/manager/needs-you';
import type { ManagerReads } from './manager-reads';
import { isBareCharacter } from '../keys/shortcuts';
import type { JumpToWorktree } from '../ship/worktree-view';

export type ManagerOptions = {
  // Where a pane row lands you: the project holding that slot, and the pane at that index.
  onJump(slot: number, index: number): void;
  // One keystroke, straight to that pane's shell, without going there.
  onAnswer(slot: number, index: number, key: string): void;
  // Closes the project holding that slot, or says why it cannot. The view picks the project; what
  // stops it is project.close's in main, and close-project.ts asks what closing costs.
  onClose(slot: number): void;
  // Redraws the page. The rows are the renderer's, so the view asks for them back rather than keeping
  // its own copy; the status bar, which names what the selection is on, is redrawn by the same call.
  onChanged(): void;
  // Enter on a worktree row: lands on its pane, or hands back the sentence saying why it could not —
  // the same answer the worktree dialog gets.
  onJumpWorktree: JumpToWorktree;
  // Enter on a queue item: wherever it points. The same answer as onJumpWorktree — a sentence when it
  // could not land, '' when it did.
  onJumpNeed(need: Need): string;
  // The removal key on a worktree row, and its button. What is asked, and what is forced, is
  // worktree-removal.ts's.
  onRemoveWorktree(target: WorktreeTarget): void;
  // A sentence for the status bar, or '' to take back the one this view put there. Every one is an
  // answer to a jump, never a failure, so none of them goes in the log.
  onNotice(message: string): void;
  // What a key is bound to now, so the status bar names the removal key in force.
  binding(actionName: string): string;
  // Every open project's board and every worktree git knows of in it, read in the background.
  reads: ManagerReads;
};

export type ManagerView = {
  element: HTMLElement;
  // The rows are read from the renderer's pages, which are the live ones — the page holds none of its
  // own, so a bell that arrives while you are looking at it shows up on the next redraw.
  render(rows: readonly ManagerRow[]): void;
  // The in-place redraw, asked for by the timer and by a token sweep: every row's fields written again
  // through the same writer a render uses, while the list itself is left where it stands.
  refreshRows(rows: readonly ManagerRow[]): void;
  statusLabel(): string;
  // The manager's own keys, found by the window's one lookup and handed here. Same arrangement the
  // board has, and for the same reason: one place decides what every key on every screen does.
  runAction(action: Action): void;
  // The key that works from anywhere: does what Enter does on the next item in the queue, oldest
  // first and on past the one it last landed on, and hands back a sentence for the status bar: why
  // it could not land, that nothing is waiting, or ''.
  goToNextNeed(rows: readonly ManagerRow[]): string;
};

export function createManagerView(options: ManagerOptions): ManagerView {
  const element = document.createElement('div');
  element.className = 'view view-manager';
  // Focusable, so arriving here takes the keyboard off whatever pane had it. Without it you would be
  // looking at this page while your typing still went into the shell you came from.
  element.tabIndex = -1;
  const empty = document.createElement('p');
  empty.textContent = 'No project is open, so there is nothing to watch yet.';
  const list = document.createElement('ul');
  list.className = 'manager-list';
  // The figures along the top: every open project added up, and the worktrees out.
  const overview = createOverview();
  const projects = document.createElement('section');
  projects.className = 'manager-panel manager-projects';
  const projectsHeading = document.createElement('h2');
  projectsHeading.textContent = 'Projects';
  projects.append(projectsHeading, list);
  // What is waiting on you, oldest first, above everything else on the page. Its rows are in the same
  // list the arrows walk; only where they are drawn differs.
  const needs = document.createElement('section');
  needs.className = 'manager-panel manager-needs';
  const needsList = document.createElement('ul');
  needsList.className = 'manager-list';
  const needsNone = document.createElement('p');
  needsNone.className = 'manager-needs-none';
  needsNone.textContent = 'Nothing needs you.';
  needs.append(needsList, needsNone);
  const activity = createActivity();
  const body = document.createElement('div');
  body.className = 'manager-body';
  body.append(projects, activity.element);
  // The last line on the page: which build of the app you are looking at. Never hidden, unlike the
  // rest — it is a fact about the app rather than about the projects, so it is still the answer on a
  // window with nothing open. vite.build-version.ts says where the number comes from.
  const buildVersion = document.createElement('div');
  buildVersion.className = 'manager-version';
  buildVersion.textContent = `v${__BUILD_VERSION__}`;
  element.append(overview.element, empty, needs, body, buildVersion);

  // Asked by both draws, and cheap when nothing is due: manager-reads.ts decides what is old. The
  // timer's draw asking too is what keeps the counts moving while the page is only watched.
  function askReads(rows: readonly ManagerRow[]): void {
    options.reads.refresh(
      rows.map((row) => row.path),
      rows.flatMap((row) => row.worktrees.map((entry) => entry.worktreePath)),
    );
  }

  // Everything on the page that is not the list, from one place: both draws want it. A project's
  // worktrees are among its lines whether it is open or shut, so the lines are where they are counted.
  function drawPanels(rows: readonly ManagerRow[], drawn: readonly ManagerLine[]): void {
    const worktreePaths = drawn.flatMap((line) => (line.kind === 'worktree' ? [line.worktree.worktreePath] : []));
    overview.draw(rows, options.reads.dirtiness(), worktreePaths);
    activity.draw(recentActivity(rows.flatMap((row) => {
      const board = options.reads.boardOf(row.path);
      return board ? [{ project: row.name, board }] : [];
    })));
  }

  let lines: ManagerLine[] = [];
  // The element drawn for each line, by the line's index. Not `list.children`: the column names above
  // each group are children too, and counting them would write one row's figures into its neighbour.
  let rowElements: HTMLElement[] = [];
  // Which projects are showing their panes, kept by slot rather than by position: a project dragged
  // along the tab strip is the same project and stays open.
  const opened = new Set<number>();
  let selected = 0;
  // What the selection is on, rather than where it is. A bell arriving inserts a pane row, and an
  // index alone would slide the highlight onto a different pane between you reading it and pressing
  // Enter — so the next redraw finds the same line again wherever it has moved to.
  let selectedKey = '';
  // The queue item the next-thing key last landed on, so the next press goes on to the one after it.
  let lastNeedKey: string | null = null;
  // The queue's own list, with its column names over it when there is anything to name.
  const needHead = groupHead('need');
  function drawQueue(items: readonly HTMLElement[]): void {
    putChildren(needsList, items.length > 0 ? [needHead, ...items] : []);
    writeHidden(needsNone, items.length > 0);
  }

  // Every line's element, kept by the line's key from one draw to the next and written over, rather
  // than built again: a page whose rows are all new is a page the window lays out again from the top,
  // and that is what made arriving here the slowest tab key. Only what changed is written, so a draw
  // with nothing new touches nothing. Lines gone from the page are let go at the end of each draw.
  const built = new Map<string, HTMLElement>();
  function lineElement(line: ManagerLine): HTMLElement {
    const key = lineKey(line);
    const item = built.get(key) ?? createLine(line);
    built.set(key, item);
    writeLine(line, item, options.reads);
    return item;
  }

  // The column names over a run of terminals or worktrees, kept by the key of the line they sit over.
  const heads = new Map<string, HTMLElement>();
  function headOver(line: Extract<ManagerLine, { kind: 'pane' | 'worktree' }>): HTMLElement {
    const key = lineKey(line);
    const head = heads.get(key) ?? groupHead(line.kind);
    heads.set(key, head);
    return head;
  }

  // The elements for the lines as they now stand, and nothing kept for a line no longer among them.
  function drawLines(): void {
    rowElements = lines.map(lineElement);
    const keys = new Set(lines.map(lineKey));
    for (const kept of [built, heads]) {
      for (const key of kept.keys()) {
        if (!keys.has(key)) kept.delete(key);
      }
    }
  }

  function highlight(): void {
    rowElements.forEach((item, index) => item.classList.toggle('highlighted', index === selected));
  }

  function createLine(line: ManagerLine): HTMLElement {
    const item = createRow(line);
    // A click moves the selection to the row first and then does what Enter does there. It finds the
    // line's place when it fires rather than when it was built: the queue redraws on its own, and a row
    // built before an item joined it sits one place further down.
    item.addEventListener('click', () => {
      setSelection(rowElements.indexOf(item));
      open();
    });
    if (line.kind !== 'worktree') return item;
    // The button is the mouse's way to the same removal the key does, so it selects the row first: the
    // highlight is then on the worktree the question names. The worktree is the line's as it is now,
    // not as it was when the row was built.
    const remove = document.createElement('button');
    remove.className = 'manager-remove';
    remove.type = 'button';
    remove.textContent = 'Remove';
    // Out of the Tab order: the list is walked with the arrows, and a button Tab can land on is a
    // second place the keyboard can be that the highlight does not show.
    remove.tabIndex = -1;
    remove.addEventListener('click', (event) => {
      // Kept off the row, whose own click would go to the worktree's pane.
      event.stopPropagation();
      const index = rowElements.indexOf(item);
      const current = lines[index];
      setSelection(index);
      options.onChanged();
      if (current?.kind === 'worktree') options.onRemoveWorktree(current.worktree);
    });
    item.append(remove);
    return item;
  }

  function currentNeeds(rows: readonly ManagerRow[]): Need[] {
    return needsYou(rows, options.reads.boardOf, options.reads.dirtiness().dirty);
  }

  function needLines(rows: readonly ManagerRow[]): ManagerLine[] {
    return currentNeeds(rows).map((need) => ({ kind: 'need', need }));
  }

  // Only a project with something to show can be opened or shut: on a quiet row the key does nothing
  // rather than opening an empty gap. A row left open stays in the set while the project is quiet, so
  // it draws itself open again when one of its panes rings.
  function toggle(row: ManagerRow): void {
    if (!canOpen(row)) return;
    if (opened.has(row.slot)) opened.delete(row.slot);
    else opened.add(row.slot);
  }

  // Where the selection is and what it is on, always written together: set one without the other and
  // the next redraw hunts for a line the highlight is no longer on and drags it back.
  function setSelection(index: number): void {
    selected = index;
    selectedKey = lines[index] ? lineKey(lines[index]) : '';
  }

  // The rows flattened to the lines on screen, with the highlight put back onto the line it was on
  // wherever a project opening its panes has pushed it to. Both redraws start here, so neither can
  // leave the selection naming one row while it sits on another.
  function relayout(rows: readonly ManagerRow[]): void {
    lines = [...needLines(rows), ...managerLines(rows, opened, options.reads.worktreesOf)];
    setSelection(heldIndex(lines.map(lineKey), selectedKey, selected));
  }

  // The list does not wrap: holding Down stops on the last line rather than carrying you back to the
  // first project, which would be a jump you did not ask for. Nothing is redrawn for the arrow that
  // stops there — every row reads its pane's live screen as it is written, and writing thirty of them
  // to move the highlight nowhere is what a held key would do thirty times a second.
  function move(direction: 'up' | 'down'): void {
    const next = clampIndex(selected + (direction === 'down' ? 1 : -1), lines.length - 1);
    if (next === selected) return;
    setSelection(next);
    options.onChanged();
  }

  // Enter and a click both land here, and the redraw is here rather than inside toggle so that a row
  // which opens nothing still redraws.
  function open(): void {
    const line = lines[selected];
    if (!line) return;
    if (line.kind === 'pane') return options.onJump(line.slot, line.pane.index);
    if (line.kind === 'need') {
      options.onNotice(options.onJumpNeed(line.need));
      return options.onChanged();
    }
    // A worktree with no pane, or in a project closed since, says so rather than looking like a key
    // that did nothing. A landing that worked takes back whatever the last one said.
    // Redrawn either way, so a click on a worktree that cannot be landed on still moves the highlight
    // to it; a landing that worked has left this page already.
    if (line.kind === 'worktree') {
      const { worktree } = line;
      options.onNotice(worktree.entry ? options.onJumpWorktree(worktree.entry) : noPaneText(worktree));
    }
    else toggle(line.row);
    options.onChanged();
  }

  // Everything the window did not claim: a typed character on a waiting row goes straight to that
  // pane — into a shell's pty, or as the digit picking a Claude screen's answer, which takes no other
  // key — so a menu is answered without leaving this page. A screen whose question is answered on the
  // screen itself has no answer target, so its keys fall through. The arrows and Enter never reach
  // here — the window's one lookup matches them first and stops them — and shortcuts.ts says which
  // keystrokes count as typed and why the rest are kept out.
  element.addEventListener('keydown', (event) => {
    if (!isBareCharacter(event)) return;
    const pane = lines[selected] ? answerTarget(lines[selected]) : null;
    if (!pane) return;
    event.preventDefault();
    // The highlight stays on the pane that was answered: the bell comes off it, but the row does not
    // go anywhere, so a second question from the same pane is answered without picking it again.
    options.onAnswer(pane.slot, pane.index, event.key);
  });

  return {
    element,
    render(rows: readonly ManagerRow[]): void {
      askReads(rows);
      relayout(rows);
      const anyOpen = rows.length > 0;
      writeHidden(empty, anyOpen);
      // Nothing is open, so there is nothing to list, add up or report. All of it goes, leaving the
      // sentence saying how to open a project on a page of its own.
      for (const part of [overview.element, needs, body]) writeHidden(part, !anyOpen);
      drawPanels(rows, lines);
      drawLines();
      highlight();
      const openings = groupOpenings(lines);
      putChildren(list, lines.flatMap((line, index) => {
        if (line.kind === 'need') return [];
        const item = rowElements[index];
        return line.kind !== 'project' && openings.has(index) ? [headOver(line), item] : [item];
      }));
      drawQueue(rowElements.slice(0, queueLength(lines)));
      // Free when nothing moved: a page whose rows were all kept has nothing to lay out first.
      rowElements[selected]?.scrollIntoView({ block: 'nearest' });
    },
    // Every thirty seconds, so neither the ages nor the lines beside them freeze where they stand. A
    // pane printing calls nothing — the bytes go into the terminal and that is all — so without this
    // a quiet row's line only moves when a keystroke, a bell or an exit forces a whole redraw, and
    // the age sits beside it saying `just now` about text from ten minutes ago.
    // The rows are written over where they stand, as a render writes them, but the list is never put
    // back and nothing is scrolled to: that would throw away the line you had selected to copy out,
    // under someone who is sitting there reading it.
    refreshRows(rows: readonly ManagerRow[]): void {
      // Written into the rows that are on screen, so this writes only while the fresh rows are those
      // rows. A project opened or a pane appeared means a full render is what caused it and a full
      // render is what draws it. The lines themselves are taken, stale panes and all, because
      // the timestamps they hold are copies made when the row was last drawn.
      // Ahead of the check below, because the overview and the activity are not rows: they add up
      // every open project whatever the list underneath is doing, so a sweep that lands while a
      // row is opening still moves them.
      askReads(rows);
      const fresh = [...needLines(rows), ...managerLines(rows, opened, options.reads.worktreesOf)];
      drawPanels(rows, fresh);
      if (queueRefresh(lines, fresh) === 'render') return;
      // Kept, so the status bar reads the selected pane's age off the same numbers the row shows.
      lines = fresh;
      // Every row written again: an agent spends while its state stays `quiet`, so a figure left out
      // of this redraw sits at what it was when the row was built.
      drawLines();
      // An agent going quiet puts an item on the queue with nothing else happening, so no other redraw
      // would ever draw it. Free when the queue has not moved: drawQueue puts nothing back then.
      drawQueue(rowElements.slice(0, queueLength(lines)));
      setSelection(heldIndex(lines.map(lineKey), selectedKey, selected));
      highlight();
    },
    statusLabel(): string {
      const line = lines[selected];
      if (!line) return '';
      const removeHint = ` · ${options.binding('manager-remove')} removes it`;
      const target = answerTarget(line);
      const answer = target === null ? '' : ` · type ${target.answers === 'digit' ? 'a listed digit' : 'a character'} to answer it`;
      if (line.kind === 'need') {
        const remove = removableWorktree(line) ? removeHint : '';
        return `${line.need.project} · ${line.need.subject} · ${NEED_LABELS[line.need.kind]}${remove}${answer}`;
      }
      if (line.kind === 'worktree') {
        const { worktree } = line;
        return `${worktree.branch} · ${dirtyText(options.reads, worktree.worktreePath)} · ${formatSize(worktree.bytes)}${removeHint}`;
      }
      if (line.kind === 'pane') {
        const age = paneAge(line.pane.lastPrintedAt);
        return `${line.pane.name} · ${line.pane.state}${age === '' ? '' : ` · ${age}`}${answer}`;
      }
      return `${line.row.name} · ${alertSummary(line.row.panes)}`;
    },
    goToNextNeed(rows: readonly ManagerRow[]): string {
      // Asked here too, since the key works from pages where the list is never drawn: the boards and
      // the dirty check it needs are read now, and a press before they land sees the panes alone.
      askReads(rows);
      const { landedOn, reason } = nextLanding(currentNeeds(rows), lastNeedKey, options.onJumpNeed);
      if (landedOn !== null) lastNeedKey = landedOn;
      return reason;
    },
    runAction(action: Action): void {
      if (action.kind === 'manager-select') return move(action.direction);
      if (action.kind === 'manager-open') return open();
      // manager.ts says which lines the removal key acts on.
      if (action.kind === 'manager-remove') {
        const entry = lines[selected] ? removableWorktree(lines[selected]) : null;
        if (entry) options.onRemoveWorktree(entry);
        return;
      }
      // A pane row closes its project, rather than doing nothing: the close key is aimed at a project
      // and the panes on screen are that project's, so the key means the same thing wherever the
      // highlight is inside the block. Which project a line belongs to is manager.ts's to answer.
      if (action.kind === 'project-close') {
        const line = lines[selected];
        if (line) options.onClose(slotOfLine(line));
      }
    },
  };
}
