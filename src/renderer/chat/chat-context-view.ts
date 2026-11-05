import type { DashboardBridge } from '../../shared/app/bridge';
import type { DocReply } from '../../shared/drawer/drawer';
import { contextLevel, levelTitle, nextStep, type ContextLevel, type ContextList, type Conversation, type LevelRow, type Opened, type Picked } from '../../shared/chat/chat-context-levels';
import { clockTime, statusMeters, type ChatMeasure } from '../../shared/chat/chat-status';
import { formatTokens } from '../../shared/usage/usage';
import { failureText } from '../../shared/errors/failure';
import { anchoredPopup, type PopupRow, type PopupSection } from '../app/anchored-popup';
import { docOverlay } from '../drawer/doc-viewer';
import { piece } from './chat-foot-view';
import { firstShow } from './chat-first-show';
import { createMeasureRefresh } from './chat-measure-refresh';
import { iconOnlyButton } from '../app/icons';

// The Claude screen's measure of its session, and the context popup that breaks it down. The view
// asks for a measure when the screen is first shown, a turn ends, a model is picked or the refresh key
// is pressed; the latest one asked for is the one kept, the foot draws it, and an open popup reads it
// again when it lands. How the rows are shaped, and what each opens a level down, is chat-context.ts's
// and chat-context-levels.ts's; this only asks main and draws.

export type Measures = {
  latest(): ChatMeasure | null;
  take(): void;
  // The refresh key and the button the foot draws after the meters: measure now (chat-measure-refresh.ts).
  refresh(): void;
  button: HTMLButtonElement;
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

// A picked row's choice and its key, which the level picked from opens on again.
type Taken = { picked: Picked; key?: string };

// What Escape answers on a level below the top: go back one.
const BACK: Taken = { picked: { kind: 'back' } };

function row(each: LevelRow): PopupRow<Taken> {
  const bar = piece('chat-meter-bar', '');
  bar.style.setProperty('--tone', each.tone ? `var(--${each.tone})` : 'var(--line)');
  bar.style.setProperty('--used', `${Math.min(100, each.percentage)}%`);
  const name = piece('chat-context-name', each.name);
  if (each.detail) name.append(piece('chat-context-detail', ` ${each.detail}`));
  return {
    key: each.key,
    cells: [name, bar, piece('chat-context-tokens', formatTokens(each.tokens)), piece('chat-context-share', `${each.percentage.toFixed(1)}%`)],
    choice: each.choice && { picked: each.choice, key: each.key },
  };
}

function sections(level: ContextLevel): PopupSection<Taken>[] {
  return level.sections.map((section) => ({ title: section.title, rows: section.rows.map(row) }));
}

function heading(measure: ChatMeasure, title: string | null): string {
  // The meter's own words, so the heading and the foot cannot say it differently.
  const [meter] = statusMeters(measure);
  const at = clockTime(measure.at);
  const top = `Context ${Math.floor(meter.percentage)}% · ${meter.detail}${at ? ` · measured ${at}` : ''}`;
  return title === null ? top : `${title} · Escape goes back`;
}

export function createMeasures(
  bridge: DashboardBridge, slot: number, projectPath: string, drawn: () => void, say: (message: string) => void,
  warn: (message: string) => void,
): Measures {
  let measured: ChatMeasure | null = null;
  let asked = 0;
  const firstShown = firstShow();
  // The open popup's way to read the measure again; one popup is up at a time.
  let redraw: (() => void) | undefined;

  // Shown, a turn ending, a model picked and a refresh each measure, and the answers can come back out
  // of order: only the latest one asked is kept.
  function take(start = false): Promise<ChatMeasure | null> {
    const ask = ++asked;
    return bridge.chatMeasure(slot, start).then((reading) => {
      if (ask !== asked) return reading;
      if (reading !== null) {
        measured = reading;
        usage.landed();
      }
      drawn();
      redraw?.();
      return reading;
    });
  }
  const quietly = (start = false): void => void take(start).catch(() => undefined);

  const button = iconOnlyButton('chat-foot-refresh', 'refresh', 'Refresh the usage meters', () => usage.refresh());
  // A click leaves the keyboard in the box rather than on the button.
  button.addEventListener('mousedown', (event) => event.preventDefault());
  const usage = createMeasureRefresh(
    take, (busy) => button.classList.toggle('busy', busy), say,
    (error) => warn(`Usage not refreshed: ${failureText(error)}`),
  );

  // A memory file in the drawer's doc viewer, which main reads because the measure named it; resolves
  // once the viewer is put away, or at once when main refuses or fails.
  async function readMemory(file: string): Promise<void> {
    let reply: DocReply;
    try {
      reply = await bridge.readDoc(projectPath, file);
    } catch (error: unknown) {
      return say(`Could not read ${file}: ${failureText(error)}`);
    }
    if ('refused' in reply) return say(reply.refused);
    const { text, images } = reply;
    await new Promise<void>((resolve) => docOverlay(file, text, images, null, (url) => bridge.openExternal(url), resolve));
  }

  return {
    latest: () => measured,
    take: () => quietly(),
    refresh: usage.refresh,
    button,
    shown() {
      if (firstShown.take()) quietly(true);
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
      let trail: Opened[] = [];
      let start: string | undefined;
      for (;;) {
        const open = anchor();
        if (!open) return;
        const list = trail.at(-1)?.list ?? null;
        const taken = await anchoredPopup<Taken>({
          name: 'chat-context', anchor: open, heading: () => heading(current(), levelTitle(list)), sections: () => sections(level(list)),
          watch: (changed) => {
            redraw = changed;
            return () => { redraw = undefined; };
          },
          escape: list === null ? undefined : BACK,
          start,
        });
        if (taken === undefined) return;
        const step = nextStep(trail, taken.picked, taken.key);
        if ('jump' in step) return jump(step.jump);
        // The viewer is over the popup's place; putting it away comes back to the same level.
        if ('read' in step) await readMemory(step.read);
        ({ trail, start } = step);
      }
    },
  };
}
