import { workerPrompt } from '../../workers/dispatch';
import { action } from '../action';
import { isFilledText, isFilledTextOrNull } from './pane-input';

// Text into a pane, from `pane send`: whatever is in it is the asker's to know, an agent, a prompt, a
// REPL. A worker screen takes it as a prompt; its hidden shell would only swallow it.
//
// Text a main sends an agent is work handed to it, whoever started the agent: the pane becomes that
// main's worker, as a `pane run` makes it, and the text ends with the line telling it to report there
// (workers-decision-1). Only to an agent: a shell or a REPL would run the line.

export type PaneSendInput = {
  id: string;
  text: string;
  // The page whose main is sending, or null for text from nobody's main.
  dispatcherPath: string | null;
};

export type PaneSendPorts = {
  // Whether an agent runs in the pane: Claude Code in its terminal, or a Claude screen over it.
  agentIn(id: string): boolean;
  // The pane is that main's worker from now on: its stop is told there and main may release it.
  handTo(id: string, dispatcherPath: string): void;
  // The text as the screen's next prompt, or false when the pane has no screen.
  screenPrompt(id: string, text: string): boolean;
  // Typed into the pane's shell, then Enter pressed a moment after (typeIntoPane).
  typeIntoShell(id: string, text: string): void;
};

// `handedTo` is the main the pane reports to now that it was handed this work, or null.
export const paneSend = action<PaneSendPorts, PaneSendInput, { output: string; handedTo: string | null }>('pane.send', {
  words: [],
  input: ({ id, text, dispatcherPath = null }) => (isFilledText(id) && typeof text === 'string' && isFilledTextOrNull(dispatcherPath)
    ? { id, text, dispatcherPath } : { refused: 'no pane or text was given' }),
  async run(ports, { id, text, dispatcherPath }) {
    const handedTo = dispatcherPath !== null && ports.agentIn(id) ? dispatcherPath : null;
    if (handedTo !== null) ports.handTo(id, handedTo);
    const typed = handedTo === null ? text : workerPrompt(text, handedTo);
    if (!ports.screenPrompt(id, typed)) ports.typeIntoShell(id, typed);
    return { output: `typed into ${id}`, handedTo };
  },
});
