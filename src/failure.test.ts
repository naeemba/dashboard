import { describe, expect, it, vi } from 'vitest';
import { failureNotice, failureReporter, failureText, respondToFailure } from './failure';

describe('failureText', () => {
  it('reads an Error as what it says', () => {
    expect(failureText(new Error('EACCES: permission denied'))).toBe('EACCES: permission denied');
  });

  // `throw 'boom'` is legal and reaches these handlers exactly as written.
  it('reads a thrown string as itself', () => {
    expect(failureText('boom')).toBe('boom');
  });

  // A promise rejected with nothing. Without this the status bar reads "Something broke: undefined",
  // which looks like the message is broken rather than the app.
  it('says so when nothing was given', () => {
    expect(failureText(undefined)).toBe('no reason given');
    expect(failureText(null)).toBe('no reason given');
    expect(failureText(new Error(''))).toBe('no reason given');
    expect(failureText('   ')).toBe('no reason given');
  });

  // An Error thrown with no message still names its kind, and that kind is worth a line.
  it('falls back to the kind of error when it says nothing', () => {
    expect(failureText(new TypeError(''))).toBe('TypeError');
  });

  it('reads anything else by what it prints as', () => {
    expect(failureText(404)).toBe('404');
  });
});

describe('failureNotice', () => {
  it('names the failure and says the app is still up', () => {
    const notice = failureNotice(new Error('board.json went away'));
    expect(notice).toContain('board.json went away');
    expect(notice).toContain('still running');
  });
});

describe('respondToFailure', () => {
  // The whole point: a rejection from a timer must not take five shells per open project with it.
  it('keeps the app running once a window has opened', () => {
    const response = respondToFailure(new Error('sweep threw'), true);
    expect(response.keepRunning).toBe(true);
    expect(response.keepRunning && response.message).toContain('sweep threw');
  });

  // Nothing is on screen to say it on, and nothing is running to save.
  it('stops with a box when no window has opened yet', () => {
    const response = respondToFailure(new Error('sweep threw'), false);
    expect(response.keepRunning).toBe(false);
    expect(response.keepRunning === false && response.title).toBe('Dashboard could not start');
    expect(response.keepRunning === false && response.detail).toContain('sweep threw');
  });
});

describe('failureReporter', () => {
  // A bar that is not drawn yet, then one that is. `say` answering false is the launch.
  function reporter(): {
    said: string[]; stopped: string[]; drawn: { value: boolean };
    net: ReturnType<typeof failureReporter>;
  } {
    const said: string[] = [];
    const stopped: string[] = [];
    const drawn = { value: false };
    const net = failureReporter({
      say: (message) => {
        if (!drawn.value) return false;
        said.push(message);
        return true;
      },
      stop: (title, detail) => { stopped.push(`${title}: ${detail}`); },
    });
    return { said, stopped, drawn, net };
  }

  // The whole point of the card: a rejection from a five-second timer must not take five shells per
  // open project with it.
  it('says a failure on the bar once a window has opened, and stops nothing', () => {
    const { said, stopped, drawn, net } = reporter();
    net.windowOpened();
    drawn.value = true;
    net.report(new Error('sweep threw'));
    expect(said).toHaveLength(1);
    expect(said[0]).toContain('sweep threw');
    expect(stopped).toEqual([]);
  });

  // Nothing is on screen to say it on, and no shell exists to lose.
  it('stops the launch for a failure before any window', () => {
    const { said, stopped, net } = reporter();
    net.report(new Error('nowhere to draw'));
    expect(said).toEqual([]);
    expect(stopped[0]).toContain('Dashboard could not start');
  });

  // The window is up but the page has not run its listeners yet. Sent straight away it lands nowhere
  // and nobody ever learns the .env was not read.
  it('holds what the bar could not take and sends it when the page is there', () => {
    const { said, drawn, net } = reporter();
    net.windowOpened();
    net.report(new Error('too early'));
    expect(said).toEqual([]);
    drawn.value = true;
    net.drain();
    expect(said[0]).toContain('too early');
  });

  // Something the launch caught and carried on past: the message is its own, not a notice about an
  // uncaught failure.
  it('holds a message a caller hands over and sends it verbatim', () => {
    const { said, drawn, net } = reporter();
    net.hold('/home/me/.env was not read: EISDIR');
    drawn.value = true;
    net.drain();
    expect(said).toEqual(['/home/me/.env was not read: EISDIR']);
  });

  it('drains once', () => {
    const { said, drawn, net } = reporter();
    net.hold('said once');
    drawn.value = true;
    net.drain();
    net.drain();
    expect(said).toEqual(['said once']);
  });
});

describe('a job that fails on every tick', () => {
  // The worktree sweep throws because a folder went read-only. Without this the bar is repainted with
  // the same sentence every five seconds, and a board's own message — the one saying a card is not on
  // disk — is wiped out before anyone reads it.
  it('says the same failure once', () => {
    const said: string[] = [];
    const net = failureReporter({ say: (message) => { said.push(message); return true; }, stop: () => {} });
    net.windowOpened();
    net.report(new Error('EACCES'));
    net.report(new Error('EACCES'));
    net.report(new Error('EACCES'));
    expect(said).toHaveLength(1);
  });

  // Only while it is the last thing said, so a failure is not silenced for the rest of the run by one
  // tick that happened to mention it.
  it('says it again once something else has taken the bar', () => {
    const said: string[] = [];
    const net = failureReporter({ say: (message) => { said.push(message); return true; }, stop: () => {} });
    net.windowOpened();
    net.report(new Error('EACCES'));
    net.report(new Error('the other thing'));
    net.report(new Error('EACCES'));
    expect(said).toHaveLength(3);
  });

  // Bounds how long a still-broken sweep can stay silent: the dedup that stops the five-second repaint
  // must not turn into "never says it again".
  it('says a repeating failure again once the memory has expired', () => {
    vi.useFakeTimers();
    const said: string[] = [];
    const net = failureReporter({ say: (message) => { said.push(message); return true; }, stop: () => {} });
    net.windowOpened();
    net.report(new Error('EACCES'));
    vi.advanceTimersByTime(61_000);
    net.report(new Error('EACCES'));
    expect(said).toHaveLength(2);
    vi.useRealTimers();
  });
});

describe('hold reaching a bar that already exists', () => {
  // `hold` used to only stash the message and wait for `drain`, which fires once, at the end of the
  // launch. A background sweep that starts holding after the window is up would then fail in silence
  // for the rest of the run, with nothing ever calling `drain` again to send it.
  it('says a held message straight away when there is a bar to say it on', () => {
    const said: string[] = [];
    const net = failureReporter({ say: (message) => { said.push(message); return true; }, stop: () => {} });
    net.windowOpened();
    net.drain();
    net.hold('Token figures not updated: EMFILE');
    expect(said).toEqual(['Token figures not updated: EMFILE']);
  });
});
