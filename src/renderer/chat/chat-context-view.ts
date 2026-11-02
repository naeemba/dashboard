import type { DashboardBridge } from '../../shared/app/bridge';
import type { BreakdownRow } from '../../shared/chat/chat-context';
import { clockTime, statusMeters, type ChatMeasure } from '../../shared/chat/chat-status';
import { formatTokens } from '../../shared/usage/usage';
import { anchoredPopup, type PopupRow, type PopupSection } from '../app/anchored-popup';
import { piece } from './chat-foot-view';

// The Claude screen's measure of its session, and the context popup that breaks it down. The view
// asks for a measure when the screen is first shown, a turn ends or a model is picked; the latest one asked
// for is the one kept, the foot draws it, and an open popup reads it again when it lands. How the
// rows are shaped is chat-context.ts's; this only asks main and draws.

export type Measures = {
  latest(): ChatMeasure | null;
  take(): void;
  // The screen came into view: the first time in a conversation it measures with `start`, which starts
  // the page's session. Only once, so a session that fails to start waits for a prompt, not a visit.
  shown(): void;
  // A new conversation: nothing is measured until the next answer, and one still on its way is dropped.
  forget(): void;
  // A model was picked, which shows over the measured name until the next measure names it.
  unname(): void;
  // The popup, over `anchor`, the context meter; resolves once it is closed.
  show(anchor: HTMLElement | null): Promise<void>;
};

function row(each: BreakdownRow): PopupRow<never> {
  const bar = piece('chat-meter-bar', '');
  bar.style.setProperty('--tone', each.tone ? `var(--${each.tone})` : 'var(--line)');
  bar.style.setProperty('--used', `${Math.min(100, each.percentage)}%`);
  const name = piece('chat-context-name', each.name);
  if (each.detail) name.append(piece('chat-context-detail', ` ${each.detail}`));
  return {
    key: each.key,
    cells: [name, bar, piece('chat-context-tokens', formatTokens(each.tokens)), piece('chat-context-share', `${each.percentage.toFixed(1)}%`)],
  };
}

function sections(measure: ChatMeasure): PopupSection<never>[] {
  const { categories, memoryFiles, mcpTools } = measure.breakdown;
  const all: [string | null, BreakdownRow[]][] = [[null, categories], ['Memory files', memoryFiles], ['MCP tools', mcpTools]];
  return all.filter(([, rows]) => rows.length > 0).map(([title, rows]) => ({ title, rows: rows.map(row) }));
}

function heading(measure: ChatMeasure): string {
  // The meter's own words, so the heading and the foot cannot say it differently.
  const [meter] = statusMeters(measure);
  const at = clockTime(measure.at);
  return `Context ${Math.floor(meter.percentage)}% · ${meter.detail}${at ? ` · measured ${at}` : ''}`;
}

export function createMeasures(bridge: DashboardBridge, slot: number, drawn: () => void, say: (message: string) => void): Measures {
  let measured: ChatMeasure | null = null;
  let asked = 0;
  let shownOnce = false;
  // The open popup's way to read the measure again; one popup is up at a time.
  let redraw: (() => void) | undefined;

  // Shown, a turn ending and a model picked each measure, and the answers can come back out of order:
  // only the latest one asked is kept.
  function take(start = false): void {
    const ask = ++asked;
    bridge.chatMeasure(slot, start).then((reading) => {
      if (ask !== asked) return;
      if (reading !== null) measured = reading;
      drawn();
      redraw?.();
    }, () => undefined);
  }

  return {
    latest: () => measured,
    take: () => take(),
    shown() {
      if (shownOnce) return;
      shownOnce = true;
      take(true);
    },
    forget() {
      measured = null;
      asked++;
      shownOnce = false;
    },
    unname() {
      if (measured) measured = { ...measured, model: null };
    },
    async show(anchor) {
      // An open popup keeps what it showed through a new conversation, until the next measure lands.
      if (!measured || !anchor) return say('Nothing measured yet: the context is measured once Claude has answered.');
      let shown: ChatMeasure = measured;
      const current = (): ChatMeasure => (shown = measured ?? shown);
      await anchoredPopup<never>({
        name: 'chat-context', anchor, heading: () => heading(current()), sections: () => sections(current()),
        watch: (changed) => {
          redraw = changed;
          return () => { redraw = undefined; };
        },
      });
    },
  };
}
