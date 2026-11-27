# Claude Code and Claude apps: what shipped, 2026-09-27 to 2026-11-27

2026-11-27: a point-in-time study, not a rule.

Compiled 2026-11-27. **[DASH]** marks items that matter for running many Claude Code
sessions in a dashboard (worker panes, hooks, MCP, Agent SDK, sessions, headless `-p`).

## Sources and what could be read

| Source | Status |
|---|---|
| https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md | Read in full through `gh api` (2.1.284–2.1.332). The changelog has no dates. |
| https://www.npmjs.com/package/@anthropic-ai/claude-code (`npm view … time`) | Read. Gives the publish date for each version, used below. |
| https://www.anthropic.com/news | Read (HTTP 200), plus 5 product posts. |
| https://docs.anthropic.com/en/release-notes | Redirects to platform.claude.com. The first redirect target was a "System prompts" index. Read https://platform.claude.com/docs/en/release-notes/overview instead. Its oldest ~15K characters were not read, but they fall before this window. |
| https://support.anthropic.com release notes | Redirects (301) to https://support.claude.com/en/articles/12138966-release-notes. Read. |

Installed version: `claude --version` prints 2.1.332, the latest version on npm (2026-11-24).
I opened no browser tabs. Every page was read with WebFetch, `gh` or `npm`.

---

## 1. Claude Code (by version; user-visible features only, bug fixes left out)

Source for every item: the CHANGELOG above, in the section for that version. Dates are npm
publish dates (UTC).

### 2.1.332 (2026-11-24)
- **[DASH]** Skills from MCP servers (beta). They appear as `server:skill` in the `/` menu.
- **[DASH]** New `PreSkillShellCommand` hook event. It can refuse a skill's or command's inline
  shell commands as the skill loads.
- **[DASH]** "Always deliver" option on the prompt for messages held from other sessions.
- A footer line shows while a flagged message has moved the session to a different model.
- OpenTelemetry `assistant_response` event for text sent through SendUserMessage or Cowork's message
  tool.
- VS Code and the Desktop Code tab now warn about a session that was only partly saved, or a resume
  whose earlier messages were not loaded.
- The startup header shows your Cyber Verification Program tier.

### 2.1.331 (2026-11-23)
- Code Mode on Bedrock, Google Cloud Agent Platform, Foundry and Claude Platform on AWS.
- `claude doctor` gains an API connectivity section.
- **[DASH]** `optionalDependencies` in plugin manifests.
- New `CLAUDE_CODE_DISABLE_RESPONSE_COMPRESSION` setting, for proxies that cut compressed responses
  off.
- More gen_ai.* attributes on `llm_request` trace spans.
- Claude apps gateway: `oidc.groups_jsonpath`, `CLAUDE_GATEWAY_IDP_CONNECT_BY_HOSTNAME`.

### 2.1.330 (2026-11-20)
- Sign-in to organizations managed in the Enterprise Admin Console.
- **easel**, a built-in mod that draws charts on request and under MCP metrics results (Pro, Max,
  macOS and Linux).
- `CLAUDE_CODE_FULL_SIGN_IN_LINK=1`.
- **[DASH]** `claude plugin install --json` reports `commandPrinted` and `commandFailed`.
- New self-hosted runner `/metrics`.

### 2.1.329 (2026-11-19)
- **[DASH]** The trust dialog says where a folder's hooks are declared. Non-interactive hosts get a
  warning when managed hooks fail to load.
- **[DASH]** `/tasks` now lists scheduled tasks, `/loop` wakeups, the goal and this conversation's
  forks. `x` stops one.
- **[DASH]** `/mcp` shows a "Server message" row with a remote HTTP server's JSON-RPC refusal.
- `/status` shows a "Marketplace auto-update" row.
- Code Mode can now run alongside OpenTelemetry events and metrics.

### 2.1.328 (2026-11-18)
- Auto mode for Opus 4.6 and Sonnet 4.6 on Bedrock, Agent Platform, Foundry and the gateway.
- **[DASH]** `"onFailure": "block"` for `mcp_tool` hooks.
- **[DASH]** Warning when a message from a session that skips permission prompts may be held and
  dropped by a cloud session.
- **[DASH]** `CLAUDE_CODE_DISABLE_DEFERRED_TOOL_RESUME` stops `claude -p --resume`/`--continue` from
  running a tool call that a hook deferred.
- Apps that embed Claude Code can turn on `allowManagedModsOnly`.
- `/status` and `doctor` warn about an OTel exporter that has no endpoint.

### 2.1.327 (2026-11-17)
- **[DASH]** `claude mcp add-json <name> -` reads the server's JSON from stdin, so tokens stay off
  the command line.
- **[DASH]** `/status` lists broken agent, skill, command and output-style files, keybinding errors,
  an unavailable sandbox and hook matchers that never match.
- A line appears when a resumed session's earlier messages can't be loaded.
- `/config` notes when another setting overrides a row. `/tui classic` names the non-fullscreen
  renderer.
- Confirmation before `/install-github-app` changes a repository. New `attributionProject` setting.

### 2.1.326 (2026-11-16)
- **[DASH]** Code Mode works with agent teams turned on.
- **[DASH]** Startup warning for malformed `--allowedTools`/`--disallowedTools`/`--tools` entries.
- A message explains why MCP servers stop loading after an admin adds `managed-mcp.json`.
- Ctrl+O shows hidden startup notices. A subagent's view gets an "esc to stop" hint.
- `OTEL_RESOURCE_INCLUDE_HOST`. Mod UI gains `overflowX`, `maxLines` and `wrap="clip"`.

### 2.1.325 (2026-11-13)
- A hint on how to continue after an org-policy block (`/rewind` or `/clear`).
- A note when a sandboxed git checkout or stash can't update protected `.claude` files.

### 2.1.323 (2026-11-12)
- **Code Mode** (experimental, opt-in): Claude writes JavaScript that calls its tools. See https://code.claude.com/docs/en/code-mode.
- **[DASH]** `engines["claude-code"]` in `plugin.json` gates a plugin by Claude Code version.
  `claude plugin validate` type-checks TypeScript hook modules.
- **[DASH]** A progress heartbeat every 30 seconds while hooks run long in `claude -p` and SDK
  sessions, so a host doesn't end the turn as hung.
- **[DASH]** `CLAUDE_CODE_RESUME_HINT_COMMAND` lets a program that launches Claude Code name its own
  resume command in the exit hint.
- **[DASH]** `CLAUDE_CODE_DISABLE_AGENT_PROGRESS_SUMMARIES` (available since 2.1.318).
- An options menu when a model needs usage credits. `.docx` uploads to the Artifact tool. A `/diff
  to close` hint.
- Startup warnings for Bash allow rules with `*` in a variable's value, and for plugin LSP servers
  that fail to start.

### 2.1.322 (2026-11-10)
- Fast mode on Vertex (global, us and eu).

### 2.1.321 (2026-11-09)
- **Claude Fable 5.2** (`claude-fable-5-2`) becomes the default Fable model: 1M context, $8/$40 per
  Mtok.
- **[DASH]** `claude remote-control --settings <file>` applies a settings file to every session it
  starts.

### 2.1.319 (2026-11-06)
- **[DASH]** MCP tasks: when an MCP server runs a tool call as a task, Claude Code moves it to the
  background and reports the result when it finishes. `CLAUDE_CODE_DISABLE_MCP_TASK_BACKGROUND`
  turns this off.
- **[DASH]** `permissions.denyInsteadOfPrompting`: a tool call that would wait on a permission
  prompt is denied and the turn goes on. This applies to terminal sessions, subagents and teammates,
  and suits unattended worker panes.
- **[DASH]** `/tasks` gets an "Earlier in this session" row that lists finished subagents, which you
  can reopen and message after a restart.
- `/claude-api latency-optimize`. `CLAUDE_CODE_DISABLE_FEATURE_FLAGS`. Gateway spend shows in
  `/usage`.
- Warnings when billing falls back to the `ant auth login` Console organization.

### 2.1.318 (2026-11-03)
- **[DASH]** `claude auth status` shows `loginExpiresAt`, and `claude -p` JSON includes
  `credential_expires_at`. `-p` writes a stderr warning starting 10 days before the sign-in ends.
- Mods: an `effort` option on `$.model.fork`.

### 2.1.317 (2026-11-02)
- **[DASH]** `onFailure: "block"` for Agent SDK hook callbacks.
- A check asks before a web or shell tool call sends your account email address to the network.
- `/schedule` warns about connectors you didn't ask for. New OTel attributes: `anthropic.plan`, seat
  type and provider.
- **[DASH]** `CLAUDE_CODE_DISABLE_NESTED_SESSION_ID`, which affects `claude -p` run inside a
  session.

### 2.1.316 (2026-10-31)
- **[DASH]** `CLAUDE_CODE_SUBAGENT_EFFORT` sets the effort level for subagents.
  `CLAUDE_CODE_DISABLE_ULTRATHINK` turns the keyword off.
- Gateway: pooled group budgets, layered policy mode, Bedrock guardrail input tagging.

### 2.1.314 (2026-10-30)
- **[DASH]** `permissions.blockWritesOutsideWorkingDirectories` stops Write, Edit and NotebookEdit
  outside the working directories, in every permission mode.
- Idle compaction in VS Code and the Desktop Code tab.

### 2.1.312 (2026-10-27)
- In fullscreen, clicking "to send now" under a queued message sends it.

### 2.1.311 (2026-10-26)
- `self-hosted-runner --hold-idle-file` and `--max-hold-min`.

### 2.1.310 (2026-10-23)
- **[DASH]** The Monitor tool and plugin monitors on Bedrock, Vertex and Foundry, and with telemetry
  off. Long foreground sleeps are now blocked there too.

### 2.1.307 (2026-10-21)
- `/claude-api api-version` migrates code to API version `2026-10-21`.
- **[DASH]** OTel `claude_code.safety_event` for each tool call stopped by a rule, auto mode, a hook
  or the sandbox.

### 2.1.305 (2026-10-20)
- `sandbox.allowNestedUserNamespaces` on Linux. `CLAUDE_CODE_RETRY_WATCHDOG_USAGE_LIMIT_RECHECK_MS`.

### 2.1.304 (2026-10-19)
- `/auto-mode-setup`, a guided setup that teaches auto mode about your environment.
- `/claude-api managed-agents-secure`.
- **[DASH]** Mods' `tool.check` gains `decider: "person"` and `e.isReadOnly`.
- Pro and Max get a warning before a resume would use a large share of the 5-hour limit.

### 2.1.302 (2026-10-16)
- `CLAUDE_CODE_AUTO_MODE_MODEL`. An "Idle compaction" row in `/config`.
- Notice: **standalone Claude Design (claude.ai/design) closes by 2026-12-14**.

### 2.1.301 (2026-10-15)
- **[DASH]** `CLAUDE_CODE_RETRY_WATCHDOG_MAX_USAGE_LIMIT_WAIT_MS` for unattended retry mode.
- Vim `%` motion. Multi-line `Input` for mods. Auto mode classifier fields on OTel `tool_decision`.

### 2.1.300 (2026-10-14)
- **[DASH]** Mods: `$.ui.view({ agentId })` shows an agent's transcript in the main view. A
  `prompt.change` hook. `agent.spawn` can rewrite a workflow agent's prompt and model.
- `/advisor` on Claude Platform on AWS. OTel GenAI semantic-convention span attributes.

### 2.1.299 (2026-10-14)
- **[DASH]** **Idle compaction** in the terminal: a conversation over 200K tokens that sits idle for
  about 54 minutes is compacted before its 1-hour prompt cache expires. Set with
  `CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS` or `"idleCompaction": false`. Idle worker panes will compact
  on their own.
- **[DASH]** In the agent view, `/effort` and `/fast` set what new sessions start with. The peek
  panel shows a "safe mode" line.
- `CLAUDE_CODE_DISABLE_FILE_MENTIONS`. `claude plugin eval --disallow-tools`. `/usage` warnings.
- Mods: `$.prompt.media`, `$.session.identity()`, Text and Box styling, and a `queue` door on
  `session.append`.

### 2.1.296 (2026-10-09)
- **[DASH]** `autoCompactWindow` in subagent frontmatter and `--agents`.
  `CLAUDE_CODE_WORKFLOW_SUBAGENT_MODEL`.
- Read tool `allow_large`. Settings for overloaded (529) retry delay.

### 2.1.295 (2026-10-08)
- **[DASH]** `onFailure: "block"` for command and HTTP hooks.
- **[DASH]** **Program Status Protocol (OSC 7501)**: terminals that implement it can show whether
  Claude Code is working, waiting on you or done. A dashboard terminal could read this for pane
  state.
- **[DASH]** A stderr line saying what a `claude -p` run is waiting for when it stays open after its
  last turn.
- Mods: `$.ui.notify`, Button children. `CLAUDE_CODE_RETRY_WATCHDOG_MAX_WAIT_MS`. Quoted text in the
  `/copy` picker.

### 2.1.293 (2026-10-07)
- **Claude Haiku 5.5** becomes the default Haiku model.
- **[DASH]** `agentType` in the `subagentStatusLine` payload. Mods: `isDeferred` on
  `$.tool.register`.

### 2.1.292 (2026-10-06)
- **[DASH]** An `effort` parameter on the Agent tool for sub-agents.
- `claude plugin install --marketplace <source>`.
- Mods: a `prompt.autocomplete` event, prompt caching in `$.model.complete`, workflow agents in
  `agent.spawn`.

### 2.1.290 (2026-10-05)
- **[DASH]** `claude attach <name>` and `claude logs <name>` accept part of a session name.
- **[DASH]** `agentId` on plugin-hook `tool.check` events, telling a subagent's check apart from the
  main session's.
- `/claude-api managed-agents-onboard`. A Deny button on the gateway sign-in page.

### 2.1.289 (2026-10-03)
- **[DASH]** `agent.spawn` for teammates, one agent id across plugin hook events, and idle and
  waiting states in `$.agent.list()`.

### 2.1.288 (2026-10-02)
- **[DASH]** In the agents view, Ctrl+F finds a session by name and Alt+↑/↓ jumps between groups.
- **[DASH]** A re-authenticate prompt when an MCP server asks for more OAuth scope.
- Ctrl+C draft recovery (press Up). `/code-review --max-findings`. A built-in `gh api` in cloud
  sessions.

### 2.1.287 (2026-10-01)
- **[DASH]** **Claude Mods**: plugins can now change deeper behavior. This is the hook surface most
  of the mod items above extend.
- "You should know", a built-in mod in which a side agent flags things you might miss.
- **[DASH]** An `n:<text>` filter in the agents view.
- **[DASH]** URL prompts (elicitation) from MCP servers on protocol 2025-11-25. If a server stops
  connecting, set `"bareElicitationCapability": true`.

### 2.1.286 (2026-09-30)
- A "2 of 5" counter on stacked permission prompts. Mouse support for "N more" rows.

### 2.1.285 (2026-09-29)
- **[DASH]** `claude --desktop` opens the desktop app on the current folder or on a session
  (`--continue`/`--resume`).
- **[DASH]** `claude plugin configure`, and `--config <server>.<key>=<value>` at install.
- `CLAUDE_CODE_DISABLE_WEB_FETCH`. `allowedProviders` managed setting.

### 2.1.284 (2026-09-28)
- **Claude Sonnet 5.5** becomes the default Sonnet model.
- **[DASH]** `/mcp reconnect all`.
- A "Yes, but ask again next time" answer for auto mode reads.
- Rebindable effort-slider keys. Gateway spend shown in dollars in `/usage` and the status line.

---

## 2. Claude apps (web, desktop, mobile, Cowork, Chrome)

Source: https://support.claude.com/en/articles/12138966-release-notes unless another URL is given.

| Date | Platform | Feature |
|---|---|---|
| 2026-11-24 | Web, Desktop, iOS, Android | Monthly recap out of beta. It can draw on Claude Code sessions and Cowork cloud tasks. |
| 2026-11-24 | Desktop (Mac, Windows) | Install an artifact as its own app, with a window and icon (beta). |
| 2026-11-24 | Connectors (platform not stated) | Send files to connected apps and save files from them (beta). |
| 2026-11-20 | Mobile (iOS 26+ first) | Refreshed look for Claude Mobile, rolling out gradually. |
| 2026-11-20 | Desktop, web, mobile | Computer use (beta) for Team and Enterprise. |
| 2026-11-17 | Desktop | Release channel choice: Stable or Latest (about daily). |
| 2026-11-12 | Web, Desktop | **Claude Meetings** (beta, Google Meet): add Claude to your meetings. Team and Enterprise. |
| 2026-11-06 | Not stated (Enterprise) | Track spend by cost code with project tags (beta). |
| 2026-11-05 | Not stated | New Enterprise security and admin controls. |
| 2026-11-05 | Not stated (US only) | Personal Finance in Claude (beta): link bank and investment accounts. |
| 2026-10-07 | Claude Platform billing | Monthly API credits for Max ($100), Ultra ($200) and Team (up to $500, pooled). See also https://www.anthropic.com/claude-haiku-5-5. |

Claude Code changelog items about the Desktop Code tab:
- Idle compaction in the Code tab (2.1.314, 2026-10-30).
- `claude --desktop` (2.1.285).
- Code tab notices for remote managed settings (2.1.317).

The 2.1.319 changelog mentions a "Claude Desktop November 10 change" affecting
`coworkTabEnabled`/`desktopHome`. I found no support-page entry explaining it.

**Claude in Chrome / Cowork:** no Chrome entries in any source in this window. The last Cowork
entry is "Cowork comes to every conversation" on 2026-09-16, before the window starts.

## 3. New products and models

| Date | Item | Source |
|---|---|---|
| 2026-09-28 | **Claude Sonnet 5.5** (`claude-sonnet-5-5`): $2/$10 per Mtok, 30%+ faster than Sonnet 5, default effort Medium in the apps and Claude Code | https://www.anthropic.com/claude-sonnet-5-5 |
| 2026-10-07 | **Claude Haiku 5.5** (`claude-haiku-5-5`): $0.10/$0.50, 1M context, the first Haiku with an effort setting. The Sonnet 5.5 cache-read price drops to $0.10. SDKs add computer-use and browser-use classes. | https://www.anthropic.com/claude-haiku-5-5 |
| 2026-10-21 | **Claude Duet** research preview (Pro and Max): "a new app where Claude works as a proactive agent" | support release notes |
| 2026-10-22 | Agent Skills standard donated to the Agentic AI Foundation (Linux Foundation) | https://www.anthropic.com/news/donating-agent-skills-to-the-agentic-ai-foundation |
| 2026-11-09 | **Claude Fable 5.2** (all users) and **Mythos 5.2** (vetted organizations): $8/$40, fast mode $16/$80, fast mode in Claude Code | https://www.anthropic.com/claude-fable-and-mythos-5-2 |
| 2026-11-12 | **Self-hosted Claude Managed Agents**, running on your own infrastructure | https://platform.claude.com/docs/en/release-notes/overview |
| 2026-11-12 | Claude Meetings (beta) | support release notes |
| 2026-10-06 | Cyber Verification Program expanded to 3 tiers (updated 2026-11-18) | https://www.anthropic.com/news/cyber-verification-program |

API and platform highlights, all from https://platform.claude.com/docs/en/release-notes/overview:
- **2026-10-09:** **[DASH]** Managed Agents dynamic workflows (multiagent, beta).
- **2026-10-14:** OTel export (beta). Managed Agents scheduled deployments on AWS.
- **2026-10-20:** User profiles. Organization webhooks (beta). Inference hooks out of beta.
- **2026-10-21:** API version `2026-10-21`, with new SDK majors: Python 2.0.0, TypeScript 1.0.0 and
  ant CLI 2.0.0.
- **2026-10-22:** Claude models on Google Cloud, managed by Anthropic.
- **2026-10-28:** Request size limit raised from 32 MB to 128 MB.
- **2026-11-02:** **[DASH]** Message threads (beta).
- **2026-11-17:** Linked billing (beta).
- **2026-11-23:** Enterprise Frontier Safeguards (beta).
- **Retirements:** Sonnet 4.5 on 2026-11-30. Fast mode for Opus 4.8 removed on 2026-11-30. Opus 4.5
  on 2027-01-22.
- **Agent SDK and MCP:** the API notes have no separate entries for either. Their changes appear
  only in the Claude Code changelog (SDK hook `onFailure` in 2.1.317, MCP tasks in 2.1.319, MCP
  skills in 2.1.332).

Corporate news, not products, from https://www.anthropic.com/news: S-1 filed on 2026-10-26, and
the IPO priced on 2026-11-18 and closed on 2026-11-20.

## Discrepancies noted
- **Sonnet 5.5 cache-read price:** the 2.1.284 changelog line says $0.20/Mtok. The Haiku 5.5 post
  and the API notes say it was cut to $0.10 on 2026-10-07. Both are probably right for their own
  dates.
- **Opus 5.5:** launched 2026-09-22, just before the window, so it is not listed above.

## Most relevant to this dashboard (shortlist)
1. **2.1.319:** `permissions.denyInsteadOfPrompting`, so unattended panes never hang on a prompt.
2. **2.1.299:** idle compaction. Idle panes over 200K tokens compact after about 54 minutes. Can be
   turned off.
3. **2.1.295:** OSC 7501 Program Status Protocol. The terminal learns working, waiting or done
   without parsing output.
4. **2.1.323:** `claude -p` and SDK hook heartbeat. `CLAUDE_CODE_RESUME_HINT_COMMAND` lets the
   dashboard name its own resume command.
5. **2.1.332:** MCP-served skills and the `PreSkillShellCommand` hook. "Always deliver" for held
   cross-session messages.
6. **2.1.319, 2.1.329:** `/tasks` lists finished subagents, loops and forks. MCP tasks run in the
   background.
7. **2.1.295 onward:** `onFailure: "block"` for command, HTTP, `mcp_tool` and SDK hooks.
8. **2.1.318:** `credential_expires_at` and `loginExpiresAt`, for warning before a pane's sign-in
   lapses.
