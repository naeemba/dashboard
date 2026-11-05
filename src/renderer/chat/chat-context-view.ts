import type { DashboardBridge } from '../../shared/app/bridge';
import { contextLevel, type ContextChoice, type ContextLevel, type ContextList, type Conversation, type LevelRow } from '../../shared/chat/chat-context-levels';
import { clockTime, statusMeters, type ChatMeasure } from '../../shared/chat/chat-status';
import { formatTokens } from '../../shared/usage/usage';
import { failureText } from '../../shared/errors/failure';
import { anchoredPopup, type PopupRow, type PopupSection } from '../app/anchored-popup';
import { docOverlay } from '../drawer/doc-viewer';
import { piece } from './chat-foot-view';
import { firstShow } from './chat-first-show';

// The Claude screen's measure of its session, and the context popup that breaks it down. The view
// asks for a measure when the screen is first shown, a turn ends or a model is picked; the latest one asked
// for is the one kept, the foot draws it, and an open popup reads it again when it lands. How the
// rows are shaped, and what each opens a level down, is chat-context.ts's and chat-context-levels.ts's;
// this only asks main and draws.

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
  // The popup, over `anchor`, the context meter, read again for each level as the foot is redrawn;
  // `jump` selects a turn's entry. Resolves once it is closed.
  show(anchor: () => HTMLElement | null, conversation: () => Conversation, jump: (index: number) => void): Promise<void>;
};

// What Escape answers on a level below the top: go back one.
const BACK = { kind: 'back' } as const;
type Picked = ContextChoice | typeof BACK;

function row(each: LevelRow): PopupRow<Picked> {
  const bar = piece('chat-meter-bar', '');
  bar.style.setProperty('--tone', each.tone ? `var(--${each.tone})` : 'var(--line)');
  bar.style.setProperty('--used', `${Math.min(100, each.percentage)}%`);
  const name = piece('chat-context-name', each.name);
  if (each.detail) name.append(piece('chat-context-detail', ` ${each.detail}`));
  return {
    key: each.key,
    cells: [name, bar, piece('chat-context-tokens', formatTokens(each.tokens)), piece('chat-context-share', `${each.percentage.toFixed(1)}%`)],
    choice: each.choice,
  };
}

function sections(level: ContextLevel): PopupSection<Picked>[] {
  return level.sections.map((section) => ({ title: section.title, rows: section.rows.map(row) }));
}

function heading(measure: ChatMeasure, title: string | null): string {
  // The meter's own words, so the heading and the foot cannot say it differently.
  const [meter] = statusMeters(measure);
  const at = clockTime(measure.at);
  const top = `Context ${Math.floor(meter.percentage)}% · ${meter.detail}${at ? ` · measured ${at}` : ''}`;
  return title === null ? top : `${title} · Escape goes back`;
}

export function createMeasures(bridge: DashboardBridge, slot: number, projectPath: string, drawn: () => void, say: (message: string) => void): Measures {
  let measured: ChatMeasure | null = null;
  let asked = 0;
  const firstShown = firstShow();
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

  // A memory file in the drawer's doc viewer, which main reads because the measure named it; resolves
  // once the viewer is put away, or at once when main refuses or fails.
  function readMemory(file: string): Promise<void> {
    return bridge.readDoc(projectPath, file).then((reply) => new Promise<void>((resolve) => {
      if ('refused' in reply) {
        say(reply.refused);
        return resolve();
      }
      docOverlay(file, reply.text, reply.images, null, (url) => bridge.openExternal(url), resolve);
    }), (error: unknown) => say(`Could not read ${file}: ${failureText(error)}`));
  }

  return {
    latest: () => measured,
    take: () => take(),
    shown() {
      if (firstShown.take()) take(true);
    },
    forget() {
      measured = null;
      asked++;
      firstShown.rearm();
    },
    unname() {
      if (measured) measured = { ...measured, model: null };
    },
    async show(anchor, conversation, jump) {
      // An open popup keeps what it showed through a new conversation, until the next measure lands.
      if (!measured) return say('Nothing measured yet: the context is measured once Claude has answered.');
      let shown: ChatMeasure = measured;
      const current = (): ChatMeasure => (shown = measured ?? shown);
      const level = (list: ContextList | null): ContextLevel => {
        const measure = current();
        return contextLevel(measure.breakdown, list, conversation(), measure.context.size);
      };
      // The levels open, deepest last. Escape pops one; a click beside the popup closes every level.
      const trail: ContextList[] = [];
      for (;;) {
        const open = anchor();
        if (!open) return;
        const list = trail.at(-1) ?? null;
        const picked = await anchoredPopup<Picked>({
          name: 'chat-context', anchor: open, heading: () => heading(current(), level(list).title), sections: () => sections(level(list)),
          watch: (changed) => {
            redraw = changed;
            return () => { redraw = undefined; };
          },
          escape: list === null ? undefined : BACK,
        });
        if (picked === undefined) return;
        if (picked.kind === 'back') trail.pop();
        else if (picked.kind === 'list') trail.push(picked.list);
        else if (picked.kind === 'entry') return jump(picked.index);
        // The viewer is over the popup's place; putting it away comes back to the same level.
        else await readMemory(picked.path);
      }
    },
  };
}
