import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { DashboardBridge } from './bridge';

// main resolves the shell after loading the .env file, so it can only reach here as a launch argument.
const SHELL_COMMAND_FLAG = '--shell-command=';

const bridge: DashboardBridge = {
  platform: process.platform,
  shellCommand: process.argv
    .find((argument) => argument.startsWith(SHELL_COMMAND_FLAG))
    ?.slice(SHELL_COMMAND_FLAG.length) ?? '',
  getRecentProjects: () => ipcRenderer.invoke('projects:recent'),
  openProject: (projectPath) => ipcRenderer.invoke('projects:open', projectPath),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  openExternal: (url) => ipcRenderer.send('link:open', url),
  sendInput: (id, data) => ipcRenderer.send('pty:input', id, data),
  resize: (id, cols, rows) => ipcRenderer.send('pty:resize', id, cols, rows),
  restart: (id) => ipcRenderer.send('pty:restart', id),
  onData: (listener) => ipcRenderer.on('pty:data', (_event, id, data) => listener(id, data)),
  onExit: (listener) => ipcRenderer.on('pty:exit', (_event, id, exitCode) => listener(id, exitCode)),
};

contextBridge.exposeInMainWorld('dashboard', bridge);
