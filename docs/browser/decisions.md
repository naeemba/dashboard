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
cost is the page blinking out while you hold Ctrl in the address bar.
