# Browser: hard rules

## browser-rule-1: A layer that floats over the app is a child of the body

The web page is a native view laid over the window, drawn above every bit of its
HTML. Anything drawn over the app while the page shows has to take the page off
first, or it is drawn under it: press the help key with the page on screen and
the dialog opens behind the page, unseen, while every key you press goes to it.

`browserPlacement` (`browser-placement.ts`) decides it from where a layer lives,
not from a list of dialogs: the app's own regions are the body's `#title`,
`#pages` and `#status`, and any other child of the body that is drawn floats
over them. Every sheet `openOverlay` builds, the which-key strip and the file
hints are children of the body, and so are covered without a line of their own.
A floating thing drawn inside a page instead would not be, so it is never built
there. Its test holds the rule; nothing holds where a new layer is appended.

## browser-rule-2: No door touches a view

Every change to a tab, the view on screen or its place is a browser action in
`src/main/actions/browser/`, and every door calls one: the screen's channels, a
page's new window, a page closing itself, a project closing. The views are
reached only through the actions' ports in `browser-views.ts`, the one file that
makes one, and `bypasses.test.ts` holds that. What a page does by itself (a
title set, a link followed) is written down by `browser-views.ts` and is no
action: nobody asked for it (browser-decision-2).

## browser-rule-3: A pane acts only on the tabs it holds

Every verb of the browser command but `open` and `tabs` names a tab, and the pane
must hold it, a read as much as a click: `heldTab` in `browser-holds.ts` decides
it and words the refusal, and both the actions (`target.ts`) and the reads
(`browser-page.ts`) answer with it. Without it, a worker reads the page you are
signed in to in another tab, or clicks in the tab you took back from it a minute
ago. The command's reads go through `browser-page.ts` only, never a door's own
code. A pane let go of is `browser.release` of all its tabs, from `dropPane`,
the pane's shell exiting and a new agent starting in the pane.

## browser-rule-4: An agent's action never moves the keyboard

You type in main's prompt while a worker browses, and every key lands there.
Chromium hands a tab in the window the keyboard whenever a load the app started
in it (`loadURL`, back, forward, reload) begins and again as it commits, even a
tab nobody sees: before this rule, a worker's `browser open` or `go` took the
caret out of your prompt and your next keys went to its hidden page.

`browser-views.ts` marks a tab while a load no page started is on its way in
(`appLoad`). A tab not on screen that takes the keyboard, marked or not, gives
it back to where you had it, the window's page or the tab on screen, and so
does the tab on screen while it is marked (`keyboardTaken` and `keyboardOwner`
in `browser-tabs.ts`): the window being activated again hands the keyboard to
the tab that had it last, which can be an agent's. It is given back on the next
turn, as Chromium undoes a focus asked for while it is still moving it, and only
while the window has the keyboard, so the window is never raised over the app
you are in. Only your own action gives a tab the keyboard: the browser mode, a
click on the page on screen, or the focus verb from the screen, which lets go of
the mark first.

