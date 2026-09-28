import { relativeAge } from './age';
import type { ActivityEntry, ColumnCount } from './board-summary';
import type { ManagerRow } from './manager';
import { barHeights, formatTokens, sumDays, sumTotals, WEEK_DAYS } from './usage';

// The parts of the manager's general screen that are not the list: the figures along the top and the
// recent activity beside the list. Neither takes the keyboard — there is nothing on them to press —
// so they are drawn from what they are handed and hold no selection of their own. Out of
// manager-view.ts, which is the list and its keys.

// This week as seven bars, Monday first. Each bar carries its day and its figure as a tooltip, since a
// bar with no number is a shape and nothing more. Today's bar is marked, so the gap after it reads as
// days that have not happened yet rather than days nothing was done on.
export function trendBars(days: readonly number[], className: string, today: number): HTMLElement {
  const trend = document.createElement('div');
  trend.className = `manager-trend ${className}`;
  const heights = barHeights(days);
  trend.append(...WEEK_DAYS.map((name, day) => {
    const bar = document.createElement('span');
    bar.className = 'manager-bar';
    bar.classList.toggle('today', day === today);
    bar.classList.toggle('later', day > today);
    // A floor under any day with something on it, so a day that spent a little is still a visible
    // sliver beside a day that spent a lot, and not the same nothing as a day that spent none.
    const height = heights[day] === 0 ? 0 : Math.max(heights[day], 0.08);
    bar.style.setProperty('--height', `${height * 100}%`);
    bar.title = `${name}: ${formatTokens(days[day] ?? 0)}`;
    return bar;
  }));
  return trend;
}

// Which bar is today, Monday being nought, the same count dailyTotals files a sample under.
export function todayIndex(now: number = Date.now()): number {
  return (new Date(now).getDay() + 6) % 7;
}

// A column's name as a small pill, with its count in front when there is one. The name goes on the
// element too, so the stylesheet can colour the columns that mean something — Review waiting on
// someone, Doing in hand.
export function columnChip(name: string, count?: number): HTMLElement {
  const chip = document.createElement('span');
  chip.className = 'manager-chip';
  chip.dataset.column = name.toLowerCase();
  if (count === undefined) {
    chip.textContent = name;
    return chip;
  }
  const figure = document.createElement('b');
  figure.textContent = `${count}`;
  chip.append(figure, ` ${name}`);
  return chip;
}

export function countChips(counts: readonly ColumnCount[]): HTMLElement {
  const chips = document.createElement('span');
  chips.className = 'manager-chips';
  chips.append(...counts.map((count) => columnChip(count.name, count.count)));
  return chips;
}

function tile(label: string): { element: HTMLElement; value: HTMLElement; detail: HTMLElement } {
  const element = document.createElement('div');
  element.className = 'manager-tile';
  const name = document.createElement('div');
  name.className = 'manager-tile-label';
  name.textContent = label;
  const value = document.createElement('div');
  value.className = 'manager-tile-value';
  const detail = document.createElement('div');
  detail.className = 'manager-tile-detail';
  element.append(name, value, detail);
  return { element, value, detail };
}

export type Overview = {
  element: HTMLElement;
  draw(rows: readonly ManagerRow[], dirtyCount: number): void;
};

// Four figures across the top: the three token windows added up over every open project, the week
// drawn day by day under its figure, and how many worktrees are out with how many holding work that
// is not committed.
export function createOverview(): Overview {
  const element = document.createElement('div');
  element.className = 'manager-overview';
  const fiveHours = tile('Last 5 hours');
  const week = tile('This week');
  const allTime = tile('All time');
  const worktrees = tile('Worktrees');
  element.append(fiveHours.element, week.element, allTime.element, worktrees.element);
  fiveHours.detail.textContent = 'tokens, every open project';
  allTime.detail.textContent = 'tokens, every open project';

  return {
    element,
    draw(rows, dirtyCount) {
      const totals = sumTotals(rows.map((row) => row.tokens));
      fiveHours.value.textContent = formatTokens(totals.fiveHours);
      week.value.textContent = formatTokens(totals.week);
      allTime.value.textContent = formatTokens(totals.allTime);
      week.detail.replaceChildren(trendBars(sumDays(rows.map((row) => row.days)), 'manager-trend-large', todayIndex()));
      const count = rows.reduce((total, row) => total + row.worktrees.length, 0);
      worktrees.value.textContent = `${count}`;
      worktrees.detail.textContent = dirtyCount === 0 ? 'nothing uncommitted' : `${dirtyCount} with uncommitted changes`;
      worktrees.element.classList.toggle('attention', dirtyCount > 0);
    },
  };
}

export type Activity = {
  element: HTMLElement;
  draw(entries: readonly ActivityEntry[]): void;
};

// The cards touched last across every open project, newest first: what moved while you were looking
// at something else.
export function createActivity(): Activity {
  const element = document.createElement('section');
  element.className = 'manager-panel manager-activity';
  const heading = document.createElement('h2');
  heading.textContent = 'Recent activity';
  const list = document.createElement('ol');
  list.className = 'manager-activity-list';
  const empty = document.createElement('p');
  empty.className = 'manager-muted';
  empty.textContent = 'No card on an open board has changed yet.';
  element.append(heading, list, empty);

  return {
    element,
    draw(entries) {
      empty.hidden = entries.length > 0;
      list.replaceChildren(...entries.map((entry) => {
        const item = document.createElement('li');
        const title = document.createElement('div');
        title.className = 'manager-activity-title';
        title.textContent = entry.title;
        const detail = document.createElement('div');
        detail.className = 'manager-activity-detail';
        const project = document.createElement('span');
        project.textContent = entry.project;
        const age = document.createElement('span');
        age.className = 'manager-muted';
        age.textContent = relativeAge(entry.at) ?? '';
        detail.append(project, columnChip(entry.column), age);
        item.append(title, detail);
        return item;
      }));
    },
  };
}
