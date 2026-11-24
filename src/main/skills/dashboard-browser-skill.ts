// The text of the dashboard-browser skill, which install-skills.ts writes to
// ~/.claude/skills/dashboard-browser/SKILL.md. A deferred tool is picked by matching the task to a
// skill's description, so the description names the tasks: on 2.55 workers holding every browser_
// tool still browsed in Claude in Chrome, whose two skills named theirs (browser-decision-8).
export const DASHBOARD_BROWSER_SKILL = `---
name: dashboard-browser
description: Read before reading, checking or screenshotting any web page in a session the Dashboard app started (a job board, LinkedIn, docs, a pull request, a frontend or layout check) — the project's own browser through the mcp__dashboard__browser_* tools, instead of Claude in Chrome or Playwright
---

A session the Dashboard app started has the \`dashboard\` MCP server, whose
\`browser_\` tools drive the project's own browser. A session without those tools
is not one: this skill does not apply there.

## Why this browser

- Its sign-ins are kept, per project: a site signed in once stays signed in for
  every later session in that project.
- \`browser_eval\` runs a script file of any length and saves its answer to a file,
  so a long extraction is neither cut short nor dumped into the session.
- \`browser_read\` turns the page into markdown in the app, so a page behind a
  login is never sent to a reading service.
- \`browser_screenshot\` answers with the picture itself.

## Load the tools once

When the tools are deferred, load the ones the task needs in one ToolSearch
call, not one at a time:

    select:mcp__dashboard__browser_open,mcp__dashboard__browser_tabs,mcp__dashboard__browser_claim,mcp__dashboard__browser_read,mcp__dashboard__browser_snapshot,mcp__dashboard__browser_click,mcp__dashboard__browser_type,mcp__dashboard__browser_press,mcp__dashboard__browser_eval,mcp__dashboard__browser_screenshot,mcp__dashboard__browser_go,mcp__dashboard__browser_release

## The steps

1. \`browser_open\` with the address opens a tab you hold and prints its id. To
   work on a page the person already has open, \`browser_tabs\` lists every tab
   and \`browser_claim\` takes one. Every other tool takes that id.
2. \`browser_read\` prints the page's main content as markdown, cut at 4000
   tokens unless \`max-tokens\` says otherwise; \`selector\` reads one part.
3. \`browser_snapshot\` lists what can be clicked or typed in, each with a ref
   such as \`e3\`; \`browser_click\`, \`browser_type\` and \`browser_press\` act on a
   ref. Take a new snapshot after the page changes.
4. For anything scripted (every job on a results page, a table's rows), write
   the script to a file, then \`browser_eval\` the file, with \`wait-for\` naming
   a selector that is there once the page has rendered. Its last expression is
   the answer: read the file whose path it prints.
5. \`browser_screenshot\` for a picture (\`full\` for the whole page, \`element\`
   for one part); \`browser_resize\` to 390x844 first for a phone's layout.
   \`browser_console\` and \`browser_network\` show what the page got wrong.
6. \`browser_release\` hands a tab back when you are done with it. Your tabs go
   back on their own when your pane is released or your agent exits.

## A page that asks you to sign in

Do not switch to Claude in Chrome for it. Tell the person the site needs a
sign-in, once, in this project's browser: the browser mode (Ctrl+Shift+B by default), on
the tab you opened. When they say it is done, reload the tab and go on. Never
type a password yourself.

## When Claude in Chrome is the right one

Claude in Chrome stays available. Use it when the page needs the person's own
Chrome, with its profile or one of its extensions, or when the person asks for
Chrome. Use Playwright only when the person asks for it or the project's own
tests run on it.
`;
