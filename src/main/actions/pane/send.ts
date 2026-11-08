import { action } from '../action';
import { isFilledText } from './pane-input';

// Text into a pane, from `pane send`: whatever is in it is the asker's to know, an agent, a prompt, a
// REPL. A worker screen takes it as a prompt; its hidden shell would only swallow it.

export type PaneSendPorts = {
  // The text as the screen's next prompt, or false when the pane has no screen.
  screenPrompt(id: string, text: string): boolean;
  // Typed into the pane's shell, then Enter pressed a moment after (typeIntoPane).
  typeIntoShell(id: string, text: string): void;
};

export const paneSend = action<PaneSendPorts, { id: string; text: string }, { output: string }>('pane.send', {
  words: [],
  input: ({ id, text }) => (isFilledText(id) && typeof text === 'string' ? { id, text } : { refused: 'no pane or text was given' }),
  async run(ports, { id, text }) {
    if (!ports.screenPrompt(id, text)) ports.typeIntoShell(id, text);
    return { output: `typed into ${id}` };
  },
});
