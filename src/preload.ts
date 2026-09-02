import { contextBridge, ipcRenderer } from 'electron';
import type { DashboardBridge } from './bridge';

const bridge: DashboardBridge = {
  platform: process.platform,
  getProjects: () => ipcRenderer.invoke('projects:get'),
  sendInput: (id, data) => ipcRenderer.send('pty:input', id, data),
  resize: (id, cols, rows) => ipcRenderer.send('pty:resize', id, cols, rows),
  restart: (id) => ipcRenderer.send('pty:restart', id),
  onData: (listener) => ipcRenderer.on('pty:data', (_event, id, data) => listener(id, data)),
  onExit: (listener) => ipcRenderer.on('pty:exit', (_event, id) => listener(id)),
};

contextBridge.exposeInMainWorld('dashboard', bridge);
