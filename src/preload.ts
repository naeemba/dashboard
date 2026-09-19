import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { DashboardBridge } from './bridge';

const bridge: DashboardBridge = {
  platform: process.platform,
  getRecentProjects: () => ipcRenderer.invoke('projects:recent'),
  openProject: (projectPath) => ipcRenderer.invoke('projects:open', projectPath),
  closeProject: (slot) => ipcRenderer.send('projects:close', slot),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  openExternal: (url) => ipcRenderer.send('link:open', url),
  notify: (title, body, paneId) => ipcRenderer.send('notification:show', title, body, paneId),
  onNotificationClick: (listener) =>
    ipcRenderer.on('notification:click', (_event, paneId) => listener(paneId)),
  openScrollback: (slot, index, text) => ipcRenderer.invoke('scrollback:open', slot, index, text),
  sendInput: (id, data) => ipcRenderer.send('pty:input', id, data),
  resize: (id, cols, rows) => ipcRenderer.send('pty:resize', id, cols, rows),
  restart: (id) => ipcRenderer.send('pty:restart', id),
  reportWorkingPanes: (ids) => ipcRenderer.send('panes:report', ids),
  paneUsesIn: (projectPath) => ipcRenderer.invoke('panes:use', projectPath),
  onData: (listener) => ipcRenderer.on('pty:data', (_event, id, data) => listener(id, data)),
  onExit: (listener) => ipcRenderer.on('pty:exit', (_event, id, exitCode) => listener(id, exitCode)),
  getSession: () => ipcRenderer.invoke('session:read'),
  saveSession: (session) => ipcRenderer.send('session:write', session),
  readBoard: (projectPath) => ipcRenderer.invoke('board:read', projectPath),
  writeBoard: (projectPath, board) => ipcRenderer.invoke('board:write', projectPath, board),
  onBoardChange: (listener) =>
    ipcRenderer.on('board:change', (_event, projectPath) => listener(projectPath)),
  readNotes: (projectPath) => ipcRenderer.invoke('notes:read', projectPath),
  writeNotes: (projectPath, text) => ipcRenderer.invoke('notes:write', projectPath, text),
  getSettings: () => ipcRenderer.invoke('settings:read'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:write', settings),
  shipCard: (request) => ipcRenderer.invoke('worktree:create', request),
  listWorktrees: () => ipcRenderer.invoke('worktree:list'),
  onWorktreeChange: (listener) =>
    ipcRenderer.on('worktree:change', (_event, list) => listener(list)),
  dirtyWorktrees: () => ipcRenderer.invoke('worktree:check'),
  removeWorktree: (worktreePath, force) => ipcRenderer.invoke('worktree:remove', worktreePath, force),
  runTask: (command, projectPaths) => ipcRenderer.send('task:run', command, projectPaths),
  cancelTasks: () => ipcRenderer.send('task:cancel'),
  onTaskUpdate: (listener) =>
    ipcRenderer.on('task:update', (_event, result) => listener(result)),
  readUsage: () => ipcRenderer.invoke('usage:read'),
  onUsageChange: (listener) =>
    ipcRenderer.on('usage:change', (_event, usage) => listener(usage)),
};

contextBridge.exposeInMainWorld('dashboard', bridge);
