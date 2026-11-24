# Browser

A web browser per project, as one of its modes beside terminals, nvim, board and
notes: tabs, an address bar, and the page under them. Each project signs in on
its own. The agent in a pane drives the same tabs through the `dashboard browser`
command: it opens or claims a tab, reads it, takes a picture of it, clicks in it,
and you take any tab back with a key.

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
a tab instead. A `window.open` tab is the window the page made, in the same
sign-ins, so it keeps its `window.opener` and a sign-in popup ("Sign in with
GitHub", most SSO buttons) hands the sign-in back; a link with `target=_blank`
gives up its opener, as in any browser, and opens a plain tab at its address. A
sign-in popup that closes itself takes its tab with it, and the screen goes back
to the page that opened it while that is open. The tab outlives the page that
opened it, as any tab does. A window opened from an agent's tab is that agent's
tab, behind the one you are on; opened from the tab on screen, it comes on
screen whoever opened it, you or the agent holding that tab, still the agent's.
A tab an agent holds names its pane after its title.
The revoke key (Ctrl+Shift+E, Cmd+Shift+E on a mac) takes the tab on screen back
from it: the tab is yours, the agent's next call on it is refused saying you took it back,
and that pane may not claim it again until the pane itself is let go
(browser-decision-5), even after another pane has claimed it and you took it
back from that one too.

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

## The browser command

`node "$DASHBOARD_COMMAND" browser <verb>`, run by the agent in a pane, for that
pane: the app gives every pane its id as `DASHBOARD_PANE` and its project as
`DASHBOARD_PANE_PROJECT` (a terminal at its spawn, a Claude screen at its
session's start), and outside one the command refuses. The app reads the pane
off the project and the pane's place in it, so a shell kept through a restart
that moved its project to another page still acts as its own pane. One call,
a short answer, like `pane` and `board`; `browser --help` prints the verbs.
Each verb is also a `browser_<verb>` tool on every Claude screen, and
`browser_screenshot` answers with the picture (docs/command, command-decision-8).
The server's instructions, main's prompt, the work-card skill and the review
prompt send every page read or frontend check here rather than to Playwright or
Claude in Chrome (browser-decision-7).

- `open <url> [--project <name|aka>]` opens a tab the pane holds and prints its
  id. It opens behind the tab you are on, or on screen in a project with none.
  `--project` opens it in another open project's browser; the manager has none.
- `tabs` lists the project's tabs: id, who holds them (yours, the user's, another
  pane), address and title. `claim <tab>` takes one of your tabs; one another
  pane holds is refused. `release <tab>` hands one back.
- `go <tab> <url>`, `back`, `forward`, `reload`; `resize <tab> 390x844` lays the
  page out at that size (DevTools' device metrics, for a layout at a phone's
  width) and `reset <tab>` lays it out at the view's own size again.
- `read <tab> [--max-tokens <n>] [--selector <css>]` prints the page's main
  content as markdown with its token estimate first: the page's `<main>` or
  `<article>`, else the body, without scripts, styles, navigation, the page's
  header and footer, forms or anything hidden (a `display: contents` wrapper,
  which GitHub keeps a pull request's conversation in, is not); links on the
  page's own site are their path, and a long query string is cut. Made in the
  app, so a page behind a login never goes to a reading service. Cut at 4000
  tokens unless told.
- `screenshot <tab> [--full] [--element <css>]` saves a PNG in the app's user
  data folder, under `browser-files/` (only you read it), and prints its
  path. A full page is cut at 4000 by 16000 pixels. A file there is kept a day:
  each one saved clears out those older. A session the app starts may open
  them without asking, in the folder that copy of the app saves into.
- `eval <tab> <script file> [--wait-for <css>]` reads the file where the
  command runs and runs it in the page, top-level `await` allowed, once
  `--wait-for` matches (10 seconds at most, else refused). Its last
  expression's value is saved under `browser-files/`, a string as it is and
  anything else as JSON, and the command prints its length and path; an
  exception is refused, and a script still running after 15 seconds is stopped
  and refused, though a timer or promise it left behind can still run. NaN,
  Infinity and a BigInt are saved as their text. It is the `browser.eval`
  action, not a read: a script can change the page (browser-decision-7).
- `snapshot <tab>` lists what can be clicked or typed in, from the page's
  accessibility tree, each with a ref (`e3`) good until the next snapshot. A ref
  whose element the page has since dropped or hidden says to take a new one.
  `click <tab> <ref>`, `type <tab> <ref> "<text>"` (typed at the end of what the
  field holds) and `press <tab> <key> [<ref>]` act on it.
- `console <tab>` and `network <tab>` print the last 50 errors the page logged
  and requests that failed (a status of 400 or more, or no answer), kept from the
  tab's first load.

A pane acts only on the tabs it holds, reads included (browser-rule-3). Its tabs
go back to you, still open, when its pane is released, finished or closed, its
agent exits, or another agent starts in it. The protocol is each tab's own
`webContents.debugger`; the app never opens a remote debugging port, which would
hand its window and terminals to anything on the machine (browser-decision-6).

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
- `browser-holds.ts`: who may act on a tab, claim it or have it taken back
- `claims.ts`, `page.ts`, `target.ts` (actions): claim, release and revoke;
  resize, click, type, press and eval; which tab an action means for each door
- `browser-page.ts`: the one module driving a page's content, the command's
  reads and what the page actions do
- `page-reader.ts`, `page-snapshot.ts`, `page-log.ts`, `page-keys.ts`: the
  markdown, the snapshot, the console and request log, the keys `press` sends
- `browser-cli.ts`, `browser-program.ts`, `browser-requests.ts`: the command's
  words, its process, and its door in the app

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
- Given a "Sign in with GitHub" popup, when you sign in, then the popup's tab
  closes and the page that opened it is signed in and on screen, even when other
  tabs sit after it.
- Given the drawer opens or the window resizes, then the page fills the box left for it.
- Given a worker runs `browser open localhost:5173`, then a tab naming its pane
  opens behind yours, and `browser tabs` lists it as the worker's.
- Given the worker's tab on screen, when you press Ctrl+Shift+E, then its pane
  name goes, and the worker's next `browser read` on it says you took it back.
- Given a worker holds two tabs, when its pane is released, then both stay open
  and are yours.
- Given `browser read 3 --max-tokens 500` on a long article, then the first line
  says ~500 of the whole estimate and that it was cut.

## Open questions

- Every screenshot, plain, `--full` or `--element`, of a tab not on screen was
  drawn in a bare Electron 45 window; not yet checked by hand in the app.
- A pane's shell kept by the pane host from a build before the command has no
  `DASHBOARD_PANE`, so the command refuses there until the pane starts again.

- Tabs do not come back after a restart; the mode does, on the address bar.
- Google refuses to sign in inside an embedded browser ("disallowed_useragent"),
  so a site behind a Google login never signs in here.
- The sign-ins are kept per folder path on this machine, so a host's project at
  the same path as one of yours shares its sign-ins while you are joined to it.
