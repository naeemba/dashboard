import type { ManagerPane } from '../../shared/manager/manager';
import type { ChatView } from '../chat/chat-view';

// How the manager reads a pane: off its Claude screen when it has one, main's and a worker's drawn as
// a screen alike, and off its terminal otherwise. A worker screen's shell is hidden under it, so
// neither the shell's lines nor when it last printed are anything the worker did. A screen's age is
// when its session last sent an event, so a worker that hangs is still found gone quiet, and one
// that asks is queued from about when it asked rather than ahead of everything.

export type ScreenReading = Pick<ChatView, 'rowKeys' | 'question' | 'questionLines' | 'lastEventAt'>;
export type ShellReading = { lastPrintedAt: number; tail(): string[]; lastLine(): string };
export type PaneReading = Pick<ManagerPane, 'answers' | 'lastPrintedAt' | 'tail' | 'lastPrinted'>;

export function screenReading(screen: ScreenReading): PaneReading {
  return {
    answers: screen.rowKeys(),
    lastPrintedAt: screen.lastEventAt(),
    tail: () => screen.questionLines(),
    lastPrinted: () => screen.question() ?? '',
  };
}

export function paneReading(screen: ScreenReading | undefined, shell: ShellReading): PaneReading {
  if (screen) return screenReading(screen);
  return { answers: 'character', lastPrintedAt: shell.lastPrintedAt, tail: shell.tail, lastPrinted: shell.lastLine };
}
