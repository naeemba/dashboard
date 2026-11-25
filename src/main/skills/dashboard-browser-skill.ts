// The text of the dashboard-browser skill, which install-skills.ts writes to
// ~/.claude/skills/dashboard-browser/SKILL.md. A deferred tool is picked by matching the task to a
// skill's description, so the description names the tasks: on 2.55 workers holding every browser_
// tool still browsed in Claude in Chrome, whose two skills named theirs (browser-decision-8).
import { DEFAULT_READ_TOKENS } from '../browser/page-reader';
import { BROWSER_SIGN_IN, CHROME_STAYS, DASHBOARD_TOOLS, MCP_SERVER_NAME } from '../command/mcp-tools';

// Every browser tool's full name, for the one ToolSearch call that loads them.
const BROWSER_TOOLS = DASHBOARD_TOOLS.filter((each) => each.name.startsWith('browser_'))
  .map((each) => `mcp__${MCP_SERVER_NAME}__${each.name}`).join(',');

export const DASHBOARD_BROWSER_SKILL = `---
name: dashboard-browser
description: Read before reading, checking or screenshotting any web page in a session the Dashboard app started (a job board, LinkedIn, docs, a pull request, a frontend or layout check) — the project's own browser through the mcp__${MCP_SERVER_NAME}__browser_* tools, instead of Claude in Chrome or Playwright
---

A session the Dashboard app started has the \`${MCP_SERVER_NAME}\` MCP server, whose
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

When the tools are deferred, load them in one ToolSearch call, not one at a
time:

    select:${BROWSER_TOOLS}

## The steps

1. \`browser_open\` with the address opens a tab you hold and prints its id. To
   work on a page the person already has open, \`browser_tabs\` lists every tab
   and \`browser_claim\` takes one. Every other tool takes that id. To check a
   page of your own without a server, open it as a \`data:text/html,...\` address;
   a \`file:\` address is refused.
2. \`browser_read\` prints the page's main content as markdown, cut at ${DEFAULT_READ_TOKENS}
   tokens unless \`max-tokens\` says otherwise; \`selector\` reads one part.
3. \`browser_snapshot\` lists what can be clicked or typed in, each with a ref
   such as \`e3\`; \`browser_click\`, \`browser_type\` and \`browser_press\` act on a
   ref. Take a new snapshot after the page changes.
   A form that needs a file, such as a CV: \`browser_upload\` the file into the
   ref the snapshot lists with the role file (never click the upload button: it
   opens a dialog only a person can answer), its path whole or from your folder.
   Leave the filled form in its tab for the person to review and submit; never
   press Submit unless told.
4. For anything scripted (every job on a results page, a table's rows), write
   the script to a file, then \`browser_eval\` the file, with \`wait-for\` naming
   a selector that is there once the page has rendered. Its last expression is
   the answer: read the file whose path it prints.
5. \`browser_screenshot\` for a picture (\`full\` for the whole page, \`element\`
   for one part); \`browser_resize\` to 390x844 first for a phone's layout.
   \`browser_console\` and \`browser_network\` show what the page got wrong.
   A tab you hold runs as a foreground tab though the person never sees it:
   \`document.visibilityState\` is \`visible\`, it paints, and its frames and
   timers run at full rate, so paint and timing metrics measured in it are valid.
6. \`browser_release\` hands a tab back when you are done with it. Your tabs go
   back on their own when your pane is released or your agent exits, laid out
   at their own size again.

## A page that asks you to sign in

${BROWSER_SIGN_IN} When they say it is done, reload the tab and go on.

## When Claude in Chrome is the right one

${CHROME_STAYS} It is not disabled.
`;
