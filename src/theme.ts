import type { ITheme } from '@xterm/xterm';

// Ghostty's stock look (`ghostty +show-config --default`): #282c34 background, white foreground, and its
// default 16-color palette. The renderer publishes every entry as a CSS custom property so index.css styles
// the chrome from the same values, and the main process paints the window with the background before the
// renderer exists — otherwise the first frame is white.
export const THEME: ITheme = {
  background: '#282c34',
  foreground: '#ffffff',
  cursor: '#ffffff',
  cursorAccent: '#282c34',
  selectionBackground: '#ffffff',
  selectionForeground: '#282c34',
  black: '#1d1f21',
  red: '#cc6666',
  green: '#b5bd68',
  yellow: '#f0c674',
  blue: '#81a2be',
  magenta: '#b294bb',
  cyan: '#8abeb7',
  white: '#c5c8c6',
  brightBlack: '#666666',
  brightRed: '#d54e53',
  brightGreen: '#b9ca4a',
  brightYellow: '#e7c547',
  brightBlue: '#7aa6da',
  brightMagenta: '#c397d8',
  brightCyan: '#70c0b1',
  brightWhite: '#eaeaea',
};

// Height of the title row. Main needs it to place the traffic lights inside the row; the renderer
// publishes it as a custom property so index.css sizes the row from the same number.
export const TITLE_BAR_HEIGHT = 36;
