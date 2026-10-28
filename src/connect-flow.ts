import type { DashboardBridge as Bridge } from './bridge';
import { openPicker } from './picker';
import { promptOverlay } from './overlay';
import { LOCAL_SCREEN } from './screens';
import type { Project } from './projects';
import type { Settings } from './settings';

// What the renderer hands over: the live pages and settings (functions, since both change between
// calls) and the few things that put a page on screen.
export type ConnectFlowPorts = {
  bridge: Bridge;
  projectPages(): { project: Project }[];
  openProject(path: string | null): Promise<void>;
  settings(): Settings;
  setSettings(next: Settings): void;
  host(): string;
  restore(): void;
  showNotice(span: string, text: string): void;
};

const KEEPS_YOU_HERE = 'Enter connects, Escape keeps you here';

// Asks for the address and token of a host to join. Null when either is dismissed or the address is empty.
async function askForHost(ports: ConnectFlowPorts): Promise<{ address: string; token: string } | null> {
  const address = await promptOverlay('Host address', ports.settings().remote.address, '192.168.1.20:7777', KEEPS_YOU_HERE);
  if (address === null || address.trim() === '') return null;
  const token = await promptOverlay('Host token', '', "from the host's settings screen", KEEPS_YOU_HERE);
  return token === null ? null : { address: address.trim(), token };
}

// Projects already open come first and win the deduplication, so the picker shows the live page for one
// that is also in the history.
export async function showPicker(ports: ConnectFlowPorts): Promise<void> {
  const { bridge } = ports;
  // One call either way: while connected it is relayed, so the list that comes back is the host's.
  const recent = await bridge.getRecentProjects();
  const byPath = new Map<string, Project>();
  for (const { project } of ports.projectPages()) {
    if (!project.missing) byPath.set(project.path, project);
  }
  for (const project of recent) if (!byPath.has(project.path)) byPath.set(project.path, project);
  const current = ports.settings().remote;
  const host = ports.host();
  const choice = await openPicker([...byPath.values()], {
    connectedTo: host === LOCAL_SCREEN ? null : host,
    lastAddress: current.address,
  });
  if (choice === undefined) return ports.restore();
  if (choice.kind === 'open') return ports.openProject(choice.path);
  if (choice.kind === 'disconnect') {
    await bridge.disconnectHost();
    return ports.restore();
  }
  const target = choice.kind === 'reconnect' ? { address: choice.address, token: current.token } : await askForHost(ports);
  if (target === null) return ports.restore();
  const refusal = await bridge.connectHost(target.address, target.token);
  if (refusal !== '') ports.showNotice('host', refusal);
  else ports.setSettings({ ...ports.settings(), remote: target });
  ports.restore();
}

// Opening a new project while connected would raise a folder dialog on the host's desk, so the path is
// typed instead. Null when dismissed.
export async function typedHostFolder(host: string): Promise<string | null> {
  const typed = await promptOverlay(`Folder on ${host}`, '', '/home/you/code/project', 'Enter opens it, Escape keeps you here');
  return typed === null || typed.trim() === '' ? null : typed.trim();
}
