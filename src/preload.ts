import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { DashboardBridge } from './bridge';

const bridge: DashboardBridge = {
  platform: process.platform,
  getRecentProjects: () => ipcRenderer.invoke('projects:recent'),
  openProject: (projectPath) => ipcRenderer.invoke('projects:open', projectPath),
  closeProject: (slot) => ipcRenderer.send('projects:close', slot),
  onProjectsChange: (listener) =>
    ipcRenderer.on('projects:change', (_event, open) => listener(open)),
  connectHost: (address, token) => ipcRenderer.invoke('host:connect', address, token),
  disconnectHost: () => ipcRenderer.invoke('host:disconnect'),
  onHostReport: (listener) => ipcRenderer.on('host:report', (_event, text) => listener(text)),
  onHostChange: (listener) => ipcRenderer.on('host:change', (_event, host) => listener(host)),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  openExternal: (url) => ipcRenderer.send('link:open', url),
  notify: (title, body, paneId) => ipcRenderer.send('notification:show', title, body, paneId),
  onNotificationClick: (listener) =>
    ipcRenderer.on('notification:click', (_event, paneId) => listener(paneId)),
  openScrollback: (slot, index, text) => ipcRenderer.invoke('scrollback:open', slot, index, text),
  openFile: (slot, index, link) => ipcRenderer.invoke('file:open', slot, index, link),
  sendInput: (id, data) => ipcRenderer.send('pty:input', id, data),
  resize: (id, cols, rows) => ipcRenderer.send('pty:resize', id, cols, rows),
  restart: (id) => ipcRenderer.send('pty:restart', id),
  reportWorkingPanes: (ids) => ipcRenderer.send('panes:report', ids),
  readPanes: (projectPath) => ipcRenderer.invoke('panes:read', projectPath),
  addPane: (slot) => ipcRenderer.invoke('pane:add', slot),
  closePane: (slot, index) => ipcRenderer.invoke('pane:close', slot, index),
  onPaneMark: (listener) => ipcRenderer.on('pane:mark', (_event, id, state) => listener(id, state)),
  onData: (listener) => ipcRenderer.on('pty:data', (_event, id, data) => listener(id, data)),
  onExit: (listener) => ipcRenderer.on('pty:exit', (_event, id, exitCode) => listener(id, exitCode)),
  getSession: () => ipcRenderer.invoke('session:read'),
  saveSession: (session) => ipcRenderer.send('session:write', session),
  sessionRestored: () => ipcRenderer.send('session:restored'),
  readBoard: (projectPath) => ipcRenderer.invoke('board:read', projectPath),
  peekBoard: (projectPath) => ipcRenderer.invoke('board:peek', projectPath),
  writeBoard: (projectPath, board) => ipcRenderer.invoke('board:write', projectPath, board),
  onBoardChange: (listener) =>
    ipcRenderer.on('board:change', (_event, projectPath) => listener(projectPath)),
  onNotesChange: (listener) =>
    ipcRenderer.on('notes:change', (_event, projectPath) => listener(projectPath)),
  readNotes: (projectPath) => ipcRenderer.invoke('notes:read', projectPath),
  writeNotes: (projectPath, text) => ipcRenderer.invoke('notes:write', projectPath, text),
  getSettings: () => ipcRenderer.invoke('settings:read'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:write', settings),
  shipCard: (request) => ipcRenderer.invoke('worktree:create', request),
  listWorktrees: () => ipcRenderer.invoke('worktree:list'),
  onWorktreeChange: (listener) =>
    ipcRenderer.on('worktree:change', (_event, list) => listener(list)),
  dirtyWorktrees: () => ipcRenderer.invoke('worktree:check'),
  scanWorktrees: (projectPaths) => ipcRenderer.invoke('worktree:scan', projectPaths),
  removeWorktree: (worktreePath, force, projectPath) =>
    ipcRenderer.invoke('worktree:remove', worktreePath, force, projectPath),
  runTask: (command, projectPaths) => ipcRenderer.send('task:run', command, projectPaths),
  cancelTasks: () => ipcRenderer.send('task:cancel'),
  onTaskUpdate: (listener) =>
    ipcRenderer.on('task:update', (_event, result) => listener(result)),
  readUsage: () => ipcRenderer.invoke('usage:read'),
  readMarkets: () => ipcRenderer.invoke('markets:read'),
  onUsageChange: (listener) =>
    ipcRenderer.on('usage:change', (_event, usage) => listener(usage)),
  onFailure: (listener) =>
    ipcRenderer.on('failure:show', (_event, message) => listener(message)),
  writeLog: (draft) => ipcRenderer.send('log:write', draft),
  readLog: () => ipcRenderer.invoke('log:read'),
  onLogAppended: (listener) =>
    ipcRenderer.on('log:appended', (_event, entry) => listener(entry)),
  chatSend: (slot, content) => ipcRenderer.send('chat:send', slot, content),
  chatInterrupt: (slot) => ipcRenderer.send('chat:interrupt', slot),
  chatAnswer: (slot, id, result) => ipcRenderer.send('chat:answer', slot, id, result),
  chatConfigure: (slot, change) => ipcRenderer.invoke('chat:configure', slot, change),
  chatMeasure: (slot) => ipcRenderer.invoke('chat:measure', slot),
  chatRead: (slot) => ipcRenderer.invoke('chat:read', slot),
  chatReset: (slot) => ipcRenderer.send('chat:reset', slot),
  chatCommands: (slot) => ipcRenderer.invoke('chat:commands', slot),
  chatModels: (slot) => ipcRenderer.invoke('chat-models:read', slot),
  chatSessions: (slot) => ipcRenderer.invoke('chat:sessions', slot),
  readPdf: (slot, file) => ipcRenderer.invoke('pdf:read', slot, file),
  onViewerDismiss: (listener) => ipcRenderer.on('viewer:dismiss', () => listener()),
  chatResume: (slot, sessionId) => ipcRenderer.send('chat:resume', slot, sessionId),
  chatPrompts: (slot) => ipcRenderer.invoke('chat-prompts:read', slot),
  chatRewind: (slot, point, choice) => ipcRenderer.invoke('chat:rewind', slot, point, choice),
  chatMcpServers: (slot) => ipcRenderer.invoke('chat-mcp:read', slot),
  chatMcpServer: (slot, name, action) => ipcRenderer.invoke('chat-mcp:change', slot, name, action),
  onChat: (listener) => ipcRenderer.on('chat:receive', (_event, slot, chatEvent) => listener(slot, chatEvent)),
};

contextBridge.exposeInMainWorld('dashboard', bridge);
