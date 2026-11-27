import type { WorkerState } from '../../shared/app/bridge';

// Claude Code's Program Status Protocol, OSC 7501: what a Claude in a pane says it is doing, read off
// its pty beside the hooks a terminal worker runs (dispatch.ts's workerSettings). There is no document
// for it; the bytes here are the ones Claude Code 2.1.332 wrote into a pty:
//
//   ESC ] 7501 ; ? BEL                                       the probe, sent once at start
//   ESC ] 7501 ; state=blocked:app=claude-code:kind=permission:msg=<base64> BEL
//   ESC ] 7501 ; state=clear BEL
//
// It sends a status only once the terminal answers the probe with an OSC 7501 whose data starts with
// `?`, so the answer is the probe itself. The states are working, blocked (kind permission, question or
// auth), done, idle and error. A worker paused on its own background work reads working, and nothing
// carries the prompt's source or the last message, so the hooks stay the source of running and done:
// a status only adds what no hook says, a worker stopped on a question, and takes that mark off again
// once it is working. A failed turn (error) is left to the stall sweep, which tells main; blocked would
// take the pane out of it and tell nobody. Anything else, or a sequence this does not read, is ignored, so a
// later Claude Code changing the format cannot misreport a worker.

const START = '\x1b]7501;';
export const PROBE_ANSWER = '\x1b]7501;?\x07';
// Longer than any status Claude Code writes (its title and message are cut short before encoding): a
// start with no end within this many characters is not one, and is let go of.
const LONGEST = 4096;

// One pane's reader, fed each chunk of its output: `answer` is written back into the pty, `tell` is the
// worker's state.
export function programStatusReader(answer: (text: string) => void, tell: (state: WorkerState) => void) {
  // The start of a sequence the last chunk cut off.
  let held = '';
  // Whether the last thing told was blocked: only then does working tell running, whatever came between.
  let marked = false;
  // Whether this block was already told, so a repeated blocked status tells nothing; a done or idle
  // ends it, and the next blocked is told again.
  let blocked = false;

  function heard(body: string): void {
    if (body.startsWith('?')) {
      answer(PROBE_ANSWER);
      return;
    }
    const state = stateFrom(body);
    if (state === 'blocked' && !blocked) {
      blocked = marked = true;
      tell('blocked');
    } else if (state === 'working' && marked) {
      blocked = marked = false;
      tell('running');
    } else if (state === 'over') blocked = false;
  }

  return {
    read(data: string): void {
      let text = held + data;
      held = '';
      for (;;) {
        const start = text.indexOf(START);
        if (start === -1) {
          held = cutStart(text);
          return;
        }
        const body = text.slice(start + START.length);
        const end = terminator(body);
        if (end === undefined) {
          held = text.length - start > LONGEST ? '' : text.slice(start);
          return;
        }
        if (end.length > 0) heard(body.slice(0, end.at));
        text = body.slice(end.at + end.length);
      }
    },
  };
}

// The end of an OSC: BEL, or ST (ESC \\). Any other escape cuts it short, as a terminal does, and it
// is skipped unread (`length` 0), so a lost end never swallows the status after it.
function terminator(body: string): { at: number; length: number } | undefined {
  const bell = body.indexOf('\x07');
  const escape = body.indexOf('\x1b');
  const at = bell === -1 || (escape !== -1 && escape < bell) ? escape : bell;
  if (at === -1 || (body[at] === '\x1b' && at === body.length - 1)) return undefined;
  if (body[at] === '\x07') return { at, length: 1 };
  return body[at + 1] === '\\' ? { at, length: 2 } : { at, length: 0 };
}

// The tail of a chunk that could be the first characters of a start the next chunk finishes.
function cutStart(text: string): string {
  const tail = text.slice(text.lastIndexOf('\x1b'));
  return tail.startsWith('\x1b') && START.startsWith(tail) ? tail : '';
}

// The state one status says, as this reads it: null when it is not a status this reads, or one it
// leaves to the hooks or the stall sweep, which changes nothing at all.
function stateFrom(body: string): 'blocked' | 'working' | 'over' | null {
  const fields = new Map(body.split(':').map((field) => {
    const equals = field.indexOf('=');
    return [field.slice(0, equals), field.slice(equals + 1)] as const;
  }));
  if (fields.get('app') !== 'claude-code') return null;
  switch (fields.get('state')) {
    case 'blocked':
      return 'blocked';
    case 'working':
      return 'working';
    case 'done':
    case 'idle':
      return 'over';
    default:
      return null;
  }
}
