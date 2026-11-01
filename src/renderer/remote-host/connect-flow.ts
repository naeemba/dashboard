import type { DashboardBridge as Bridge, Project } from '../../shared/app/bridge';
import { failureText } from '../../shared/errors/failure';
import type { PickerChoice, PickerState } from '../app/picker';
import { LOCAL_SCREEN } from '../../shared/remote-host/screens';
import type { Settings } from '../../shared/settings/settings';

// What the renderer hands over: the live pages and settings (functions, since both change between
// calls) and the few things that put a page on screen.
export type ConnectFlowPorts = {
  bridge: Pick<Bridge, 'getRecentProjects' | 'connectHost' | 'disconnectHost'>;
  // The two overlays, handed in so this file imports nothing that touches the document.
  pick(projects: Project[], state: PickerState): Promise<PickerChoice>;
  prompt(question: string, current: string, placeholder: string, keysLine: string): Promise<string | null>;
  projectPages(): { project: Project }[];
  openProject(path: string | null): Promise<void>;
  settings(): Settings;
  setSettings(next: Settings): void;
  host(): string;
  restore(): void;
  showNotice(span: string, text: string): void;
};

const KEEPS_YOU_HERE = 'Enter connects, Escape keeps you here';

// What a prompt answered, trimmed. Null when it was dismissed or left empty.
function typedText(answer: string | null): string | null {
  const text = answer?.trim() ?? '';
  return text === '' ? null : text;
}

// Asks for the address and token of a host to join. Null when either is dismissed or the address is empty.
async function askForHost(ports: ConnectFlowPorts, address: string): Promise<{ address: string; token: string } | null> {
  const typedAddress = typedText(await ports.prompt('Host address', address, '192.168.1.20:7777', KEEPS_YOU_HERE));
  if (typedAddress === null) return null;
  const token = await ports.prompt('Host token', '', "from the host's settings screen", KEEPS_YOU_HERE);
  return token === null ? null : { address: typedAddress, token };
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
  const choice = await ports.pick([...byPath.values()], {
    connectedTo: isRemoteHost(host) ? host : null,
    lastAddress: current.address,
  });
  if (choice === undefined) return ports.restore();
  if (choice.kind === 'open') return ports.openProject(choice.path);
  // A refusal said last time must not sit beside whatever this attempt does.
  ports.showNotice('host', '');
  try {
    if (choice.kind === 'disconnect') return await bridge.disconnectHost();
    // A remembered host with no token to go with it is asked for like a new one, not sent with ''.
    const remembered = choice.kind === 'reconnect' && current.token !== '';
    const target = remembered ? { address: choice.address, token: current.token }
      : await askForHost(ports, choice.kind === 'reconnect' ? choice.address : current.address);
    if (target === null) return;
    const refusal = await bridge.connectHost(target.address, target.token);
    if (refusal !== '') ports.showNotice('host', refusal);
    else ports.setSettings({ ...ports.settings(), remote: target });
  } catch (error) {
    ports.showNotice('host', failureText(error));
  } finally {
    ports.restore();
  }
}

// Whether a host name is another machine's rather than this one's.
export const isRemoteHost = (host: string): boolean => host !== LOCAL_SCREEN;

// Opening a new project while connected would raise a folder dialog on the host's desk, so the path is
// typed instead. Null when dismissed.
export async function typedHostFolder(host: string, prompt: ConnectFlowPorts['prompt']): Promise<string | null> {
  return typedText(await prompt(`Folder on ${host}`, '', '/home/you/code/project', 'Enter opens it, Escape keeps you here'));
}
