import { describe, expect, it } from 'vitest';
import { editorSocket, nvimFromOutput, scrollbackFile, tabArguments, wipeArguments } from './nvim-remote';

describe('nvimFromOutput', () => {
  it('takes the path the shell printed', () => {
    expect(nvimFromOutput('/opt/homebrew/bin/nvim\n')).toBe('/opt/homebrew/bin/nvim');
  });

  // A login shell reads the rc files, and an rc file that greets you prints before the answer does.
  it('takes the last line, past whatever the rc files said first', () => {
    expect(nvimFromOutput('nvm: using node 22\nwelcome back\n/usr/local/bin/nvim\n'))
      .toBe('/usr/local/bin/nvim');
  });

  it('reads a shell that printed nothing as no nvim', () => {
    expect(nvimFromOutput('')).toBeNull();
    expect(nvimFromOutput('\n  \n')).toBeNull();
  });
});

describe('editorSocket and scrollbackFile', () => {
  // Two projects open at once must not answer for each other, and neither must two copies of the app
  // sharing one temp folder — a dev build beside the installed one.
  it('gives each slot its own socket, under this process', () => {
    expect(editorSocket('/tmp', 0)).not.toBe(editorSocket('/tmp', 1));
    expect(editorSocket('/tmp', 0)).toContain(String(process.pid));
  });

  // Five panes sharing one filename is nvim reloading the same buffer over the transcript you opened
  // a moment ago, instead of putting the two side by side.
  it('gives each pane of a project its own file', () => {
    expect(scrollbackFile('/tmp', 0, 0)).not.toBe(scrollbackFile('/tmp', 0, 1));
    expect(scrollbackFile('/tmp', 0, 0)).not.toBe(scrollbackFile('/tmp', 1, 0));
    expect(scrollbackFile('/tmp', 0, 0)).toContain(String(process.pid));
  });
});

describe('wipeArguments', () => {
  it('wipes the file before it is dropped again, so an edited copy cannot refuse', () => {
    expect(wipeArguments('/tmp/one.sock', '/tmp/scrollback.txt')).toEqual([
      '--server', '/tmp/one.sock', '--remote-expr',
      "execute('silent! bwipeout! ' .. fnameescape('/tmp/scrollback.txt'))",
    ]);
  });

  // The path goes inside a vimscript string. Left alone, a quote in it ends the string early and the
  // rest of the path is read as code.
  it("doubles a quote in the path, the way vimscript wants it", () => {
    expect(wipeArguments('/tmp/one.sock', "/tmp/it's/scrollback.txt")[3])
      .toBe("execute('silent! bwipeout! ' .. fnameescape('/tmp/it''s/scrollback.txt'))");
  });
});

describe('tabArguments', () => {
  it('asks for a tab, not an edit of what you were writing', () => {
    expect(tabArguments('/tmp/one.sock', '/tmp/scrollback.txt'))
      .toEqual(['--server', '/tmp/one.sock', '--remote-tab', '/tmp/scrollback.txt']);
  });
});
