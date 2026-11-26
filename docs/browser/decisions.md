# Browser: decisions

Settled questions. Read the entry before re-litigating it.

## browser-decision-1: One view per tab, a session partition per project folder

Each tab is an Electron `WebContentsView` of its own, sandboxed, isolated and
with no preload, so a page has no bridge to call. Its session is
`persist:browser-<hash of the project folder>`: on disk, so a sign-in survives a
restart, and per folder rather than per project name, which two folders can
share. Moving a project's folder starts it signed out. The app's own window is in
the default session, which no tab uses.

## browser-decision-2: What the page does by itself is not an action

A tab's title, the address it ended up on after a redirect or a link followed in
it, are recorded by `browser-views.ts` from the page's own events and pushed to
the screen. They are not requests anyone made, so no action makes them; every
change somebody asks for (open, close, switch, navigate, back, forward, reload,
show, hide, focus, reset) is one.

## browser-decision-3: Keys leave the page by the window's own lookup

A web page has the keyboard to itself. Main sees each key first and asks the
window's lookup (`mapShortcut`, moved to `src/shared/keys/lookup.ts` for this)
what it would do with it in browser mode; a key it would act on is taken off the
page and handed to the window, which runs it as if it had been pressed there.
No second list of keys to keep in step, and a rebinding reaches both at once.

## browser-decision-4: The page goes away under anything floating

A native view cannot be drawn under HTML. The page is hidden, not shrunk, while
a layer floats over the app (browser-rule-1): a dialog's sheet covers the whole
window anyway, and the which-key strip is up only while a modifier is held. The
cost is the page blinking out while you hold Ctrl in the address bar, once the
strip's 400 ms wait is over: the strip counts only once it is visible, so a chord
typed through it (Ctrl+A, Ctrl+V) never blinks the page. An empty strip still
counts after its wait, as when you hold Alt on a screen with no Alt keys.

## browser-decision-5: A claim is undone by the revoke key, not asked for

An agent claims a tab of yours without asking you first; the revoke key is how
you say no, at any time after. A tab you take back remembers every pane you
took it from (`takenFrom`), so each one's next call is refused saying you took
it, rather than "not yours", and none can simply claim it again; another pane
can. Letting a pane go forgets it, since pane numbers are reused and the next
agent there is somebody else. An agent's new tab opens behind yours, a window its
page opens included, so its work never takes the page from under you. The
command is allowed in every session the app starts, claim included, for the
same reason.

## browser-decision-6: The tab's own debugger, and a reader made here

The app drives a page over the DevTools protocol through each tab's
`webContents.debugger`, attached on first use, and never through
`--remote-debugging-port`, which serves every webContents of the app, its own
window and terminals included, to whatever on the machine connects. A plain
screenshot is the protocol's `Page.captureScreenshot`, which draws an agent's
tab behind yours without showing it; Electron's `capturePage` refuses a hidden
view ("Current display surface not available for capture"). A hidden view keeps
whatever size its page was last laid out at, so `reset` lays the page out at the
view's own size before clearing the override; cleared straight from 390 wide, a
hidden tab stays 390 wide until it is shown. `read` makes its markdown here
rather than calling a reader service such as Jina's: a page behind your login
would otherwise be sent to one. The page hands back a light tree of its content
and `page-reader.ts` turns it into markdown, so the rules are tested without a
browser. Console errors and failed requests come from Electron's own events,
kept from a tab's first load, so they are there before anyone asks.

## browser-decision-7: Pages go to this browser, and a script is a file

A retro on 2026-11-24 counted no `browser_` call against 140 to Playwright and
Claude in Chrome: their page scripts were capped at 1 KB, Playwright refused
files outside its roots, the extension disconnected, and zoomed screenshots of
one site came to 1.6 MB. Main's own brief had sent the worker to Chrome. So
every prompt the app writes names this browser for any page: it is signed in
per project and takes a script of any length. `eval` takes a file, not text on
the command line, so a script is not cut or quoted away, and saves the answer to
a file with a one-line reply, so a long answer does not fill the session.
`--wait-for` replaces the `sleep` a script took to let a page render. It is an
action because a script can click, type and navigate like the actions do.

## browser-decision-8: A skill and a when-to-use block send agents here, and Chrome stays

On 2.55 the job-search workers held every `browser_` tool and still made 28 Claude in Chrome
calls to none here. A session picks a deferred tool by matching its task to a skill's description
or a when-to-use block, and Chrome had a system-prompt section and two skills naming its tasks
while this browser had one sentence in the server's instructions. So the server's instructions
carry a WHEN TO USE block listing the tasks (a job board, LinkedIn, docs, a frontend check, a
screenshot, scripted extraction), and the app installs a `dashboard-browser` skill whose
description names them. A sign-in page is answered by asking the person to sign in once in this
browser, since its sign-ins are kept per project, not by switching to Chrome. Claude in Chrome is
not disabled: a page that needs the person's own Chrome profile or an extension, or a person who
asks for Chrome, still goes there. (2026-11-24)

## browser-decision-9: An agent's tab is drawn one pixel into the window

A hidden view (`setVisible(false)`) is a background tab: `visibilityState`
`hidden`, no paint, no animation frames, timers at about one a second. An agent
measuring performance got its first contentful paint at 31.6 s, when its
screenshot forced one. So while a pane holds a tab, its view is drawn at its own
size with only its bottom-right pixel in the window's top-left corner
(`viewBounds`). Measured in a dev build: `visible`, first contentful paint at
52-76 ms, 60 frames a second, timers at full rate.

What was measured and turned down: `setBackgroundThrottling(false)` makes the
page `visible` with full-rate timers, but paints nothing and runs no frames. A
view drawn wholly off the window, or under a covering view, is `hidden`: the
window's own page is not in `contentView`, so every child draws over it and none
can sit under it. `Page.startScreencast` on a hidden view changes nothing;
`incrementCapturerCount` is gone from Electron 45; a rounded corner does not clip
the pixel. The cost is that one pixel of the page, its bottom-right, shows in
the corner while an agent holds the tab. Only agent-held tabs pay it, and a page
that does not change draws no frames, so many tabs cost no more than their pages
do.


## browser-decision-10: A tab is closed by the agent holding it, never for being idle

Eleven open tabs held about 517 MB, but an idle tab may be a form left for you
to submit or a page an agent comes back to, so the app never closes one on a
timer. The agent that holds it decides. An agent's tab unused for
`browser.idleMinutes` gets one question to that agent; its answer is
`browser close`, and silence keeps the tab and is not asked again until the tab
is used and idles again. A tab you opened or are looking at is never asked
about: the screen counts as use, and a claim of your tab does not make it the
agent's to close.

An agent that is ending is not asked at the release. The release kills it, so
waiting on an answer would hold `pane release`, `pane finish` and every sweep
that lets a pane go until the agent replied. The dashboard-browser skill tells
it to close or release its tabs before it finishes instead, and a pane let go of
still holding tabs hands them to you open, with its page's main told which.
