import { workerPrompt } from '../../workers/dispatch';
import { action } from '../action';
import { isFilledText } from './pane-input';

// Text into a pane, from `pane send`: whatever is in it is the asker's to know, an agent, a prompt, a
// REPL. A worker screen takes it as a prompt; its hidden shell would only swallow it.
//
// Text a main sends an agent is work handed to it, whoever started the agent: the pane becomes that
// main's worker, as a `pane run` makes it, and the text ends with the line telling it to report there
// (workers-decision-1). Only to an agent that tells the app its turn ends (reportsTurns): a shell or a
// REPL would run the line, and an agent without the worker hooks would be listed at work forever,
// its stop never told and the app never closing it.

export type PaneSendInput = {
  id: string;
  text: string;
  // The page whose main is sending.
  dispatcherPath: string;
};

export type PaneSendPorts = {
  // Whether an agent runs in the pane: Claude Code in its terminal, or a Claude screen over it.
  agentIn(id: string): boolean;
  // Whether a Claude screen runs in the pane.
  screenIn(id: string): boolean;
  // Whether the pane is a main's worker now, which a terminal agent is only when it was started with
  // the worker hooks (pane.dispatch with a dispatcher) or handed work since.
  mainsWorkerIn(id: string): boolean;
  // The pane is that main's worker from now on: its stop is told there and main may release it.
  handTo(id: string, dispatcherPath: string): void;
  // The text as the screen's next prompt, or false when the pane has no screen.
  screenPrompt(id: string, text: string): boolean;
  // Typed into the pane's shell, then Enter pressed a moment after (typeIntoPane).
  typeIntoShell(id: string, text: string): void;
};

// Whether the pane's agent says when its turn ends: a Claude screen always does, through its own
// hooks; Claude Code in the terminal only when it was started as a worker. One you resumed from the
// drawer or a Claude opened in a terminal by hand has no hooks.
export function reportsTurns(ports: Pick<PaneSendPorts, 'agentIn' | 'screenIn' | 'mainsWorkerIn'>, id: string): boolean {
  return ports.screenIn(id) || (ports.agentIn(id) && ports.mainsWorkerIn(id));
}

// `handed`: the pane's agent is the sending main's worker now.
export const paneSend = action<PaneSendPorts, PaneSendInput, { output: string; handed: boolean }>('pane.send', {
  words: [],
  input: ({ id, text, dispatcherPath }) => (isFilledText(id) && typeof text === 'string' && isFilledText(dispatcherPath)
    ? { id, text, dispatcherPath } : { refused: 'no pane, text or sending main was given' }),
  async run(ports, { id, text, dispatcherPath }) {
    const handed = reportsTurns(ports, id);
    if (handed) ports.handTo(id, dispatcherPath);
    const typed = handed ? workerPrompt(text, dispatcherPath) : text;
    if (!ports.screenPrompt(id, typed)) ports.typeIntoShell(id, typed);
    return { output: `typed into ${id}`, handed };
  },
});
