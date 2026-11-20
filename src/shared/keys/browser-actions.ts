import type { ActionEntry } from './actions';

// The browser screen's own keys, in a file of their own because actions.ts is near its 600-line
// ceiling; ACTIONS spreads them in at its end. Each is heard in browser mode only, whether the
// address bar or the web page has the keyboard: main asks the same lookup about every key the page
// gets and hands the window the ones these name (browser-keys.ts). What each one does is
// browser-view.ts's.
export type BrowserCommand = 'address' | 'tab-new' | 'tab-close' | 'tab-next' | 'tab-previous' | 'back' | 'forward' | 'reload';

function browserKey(command: BrowserCommand, description: string, mac: string, other: string): ActionEntry {
  return { name: `browser-${command}`, description, group: 'browser', scope: 'browser', action: { kind: 'browser', command }, mac, other };
}

// The keys every browser uses where they are free here. Ctrl+T is the terminals mode key, so a new
// tab is Alt+T off a mac. On a mac, Cmd+[ and Cmd+] walk the projects and Option with an arrow moves
// by word in a page's text box, so back and forward sit on Ctrl with a bracket.
export const BROWSER_ACTIONS: ActionEntry[] = [
  browserKey('address', 'Type an address for this tab, or the first one', 'Cmd+L', 'Ctrl+L'),
  browserKey('tab-new', 'Open a new tab and type its address', 'Cmd+T', 'Alt+T'),
  browserKey('tab-close', 'Close this tab', 'Cmd+W', 'Ctrl+W'),
  browserKey('tab-next', 'Next tab', 'Ctrl+Tab', 'Ctrl+Tab'),
  browserKey('tab-previous', 'Previous tab', 'Ctrl+Shift+Tab', 'Ctrl+Shift+Tab'),
  browserKey('back', 'Back a page', 'Ctrl+[', 'Alt+Left'),
  browserKey('forward', 'Forward a page', 'Ctrl+]', 'Alt+Right'),
  browserKey('reload', 'Load this page again', 'Cmd+R', 'Ctrl+R'),
];
