import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { DashboardBridge } from './bridge';

const bridge: DashboardBridge = {
  platform: process.platform,
  getRecentProjects: () => ipcRenderer.invoke('projects:recent'),
  openProject: (projectPath) => ipcRenderer.invoke('projects:open', projectPath),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  openExternal: (url) => ipcRenderer.send('link:open', url),
  notify: (title, body) => ipcRenderer.send('notification:show', title, body),
  sendInput: (id, data) => ipcRenderer.send('pty:input', id, data),
  resize: (id, cols, rows) => ipcRenderer.send('pty:resize', id, cols, rows),
  restart: (id) => ipcRenderer.send('pty:restart', id),
  onData: (listener) => ipcRenderer.on('pty:data', (_event, id, data) => listener(id, data)),
  onExit: (listener) => ipcRenderer.on('pty:exit', (_event, id, exitCode) => listener(id, exitCode)),
  getSession: () => ipcRenderer.invoke('session:read'),
  saveSession: (session) => ipcRenderer.send('session:write', session),
  readBoard: (projectPath) => ipcRenderer.invoke('board:read', projectPath),
  writeBoard: (projectPath, board) => ipcRenderer.invoke('board:write', projectPath, board),
  getSettings: () => ipcRenderer.invoke('settings:read'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:write', settings),
};

contextBridge.exposeInMainWorld('dashboard', bridge);
