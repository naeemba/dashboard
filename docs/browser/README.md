# Browser

A web browser per project, as one of its modes beside terminals, nvim, board and
notes: tabs, an address bar, and the page under them. Each project signs in on
its own. Agents driving a tab come next, through the `dashboard browser` command;
this is the half a person uses.

## On screen

What each screen does, in full. The help dialog keeps only a short
blurb for it; this is where the rest lives.

Ctrl+Shift+B shows the browser of the project in front. A row of tabs runs along
the top, the address bar sits under it, and the rest of the page is the web page
of the tab on screen. The manager has no browser.

A project with no tab open lands on the address bar. Type an address and Enter
opens it in a first tab. An address without a scheme gets https, and one a dev
server answers gets http: `localhost` and `*.localhost`, `127.0.0.1`, `0.0.0.0`,
`[::1]` and the private ranges (`10.*`, `172.16.*` to `172.31.*`, `192.168.*`). A
search, a file and an internal page are refused on the status bar: there is no
search engine to send a search to, and a tab never shows a file on this disk.

Arriving gives the web page the keyboard, and from then on every key is the
page's except two kinds: the keys every screen hears (the mode keys, the project
keys, help, settings) and the browser's own (address, new tab, close, next and
previous tab, back, forward, reload). Main takes those off the page and hands
them to the window, which does what it would have done with the window in front.
The browser mode key is the page's, as every mode key is in its own mode.

The address key puts the keyboard in the address bar with the address selected.
Enter loads what you typed in the tab on screen; Escape puts the address back and
returns to the page. Up from the address bar walks the tab row: Left and Right
move the highlight along the tabs and the new tab chip at the end, Enter goes to
the highlighted tab, Down goes back to the address bar and Escape to the page. A
click on a tab moves the highlight there, then does what Enter does; a release that
began elsewhere, a drag from the address bar or another tab, does nothing.

A page that opens a window (a link with `target=_blank`, a `window.open`) opens
a tab instead. A tab an agent holds names its pane after its title; every tab
is yours for now.

The tabs close with the project's page: the project closed, or the screen
joining another host or coming back from one. The sign-ins do not: cookies and storage are
kept on disk per project folder, apart from every other project and from the
app's own window, and the next open of the project is still signed in. A page is
refused the camera, the microphone, the location, notifications and the screen,
and a page that only checks (`Notification.permission`) is told the same; it may
write to the clipboard.

While anything floats over the app (a dialog, the which-key strip, the file
hints) the web page is taken off the window and comes back when it goes: a web
page is a native view drawn over every bit of the window's HTML, so a dialog
would otherwise open under it, unseen, holding the keyboard (browser-rule-1).

## Files

Folders: `src/main/browser/`, `src/main/actions/browser/`, `src/renderer/browser/`,
`src/shared/browser/`.

- `browser.ts` (shared): a project's tabs as main holds them and the screen draws them
- `browser-views.ts`: the one module holding a WebContentsView, a tab each, and
  the ports the actions reach them through; a page's title, address and new
  windows; the keys taken off the page
- `browser-tabs.ts`: the tab list's rules, the view on screen, the partition and
  the permissions a page gets
- `address.ts`: what a tab may show, and what typing an address means
- `browser-ports.ts`, `tabs.ts`, `navigate.ts`, `view.ts`: the actions, each
  with its test against `browser-fixture.ts`
- `browser-actions.ts`: the actions bound and their `browser:<verb>` channels
- `browser-view.ts`, `browser.css`: the screen, and the one place the page is put
  on the window or taken off it
- `browser-placement.ts`: where the page goes, and what counts as floating over it

The keys are in `src/shared/keys/browser-actions.ts` and
`src/shared/keys/browser-keys.ts` ([keys](../keys/README.md)); the frame rule is
`frameNavigation` in `window-navigation.ts` ([app](../app/README.md)).

## Scenarios

- Given a project with no tab, when you press Ctrl+Shift+B, type `example.com`
  and Enter, then a tab opens on https://example.com and the page has the keyboard.
- Given the page has the keyboard, when you press Ctrl+B, then the board is on
  screen with the keyboard and the page is gone from the window.
- Given the page has the keyboard, when you press Ctrl+Shift+B, then the page gets it.
- Given the page has the keyboard, when you press Ctrl+H, then the help dialog
  is on screen and the page is not; closing it brings the page back with the keyboard.
- Given you typed `file:///etc/passwd`, when you press Enter, then nothing loads
  and the status bar says it is not a web page.
- Given you signed in to a site in project A, when you open it in project B,
  then B is signed out.
- Given two tabs, when you close the one on screen, then the one after it shows,
  else the one before.
- Given a link that opens a new window, when you click it, then it opens in a new tab.
- Given the drawer opens or the window resizes, then the page fills the box left for it.

## Open questions

- Tabs do not come back after a restart; the mode does, on the address bar.
- Google refuses to sign in inside an embedded browser ("disallowed_useragent"),
  so a site behind a Google login never signs in here.
- A sign-in popup opens as a tab with no `window.opener`, so a site that sends
  the sign-in back through the opener ("Sign in with GitHub", most SSO buttons)
  never finishes it. Keeping the opener means building the popup's view from
  `createWindow` in the same partition.
- The sign-ins are kept per folder path on this machine, so a host's project at
  the same path as one of yours shares its sign-ins while you are joined to it.
