import { platform } from 'node:os';

const isDarwin = platform() === 'darwin';

/**
 * Unicode symbols and indicators used throughout the TUI.
 */
export const figures = {
  // Main markers
  blackCircle: isDarwin ? '⏺' : '●',
  bullet: '∙',
  teardropAsterisk: '✻', // For reasoning / thinking indicator
  pointer: '>',
  pointerBold: '❯',
  pointerSmall: '›',

  // Status indicators
  tick: '✔',
  cross: '✖',
  warning: '⚠',
  info: 'ℹ',
  ellipsis: '…',

  // Arrows
  arrowUp: '↑',
  arrowDown: '↓',
  arrowLeft: '←',
  arrowRight: '→',

  // Box and line glyphs
  blockquoteBar: '▎', // \u258e - left 1/4 block
  horizontalLine: '─',
  heavyHorizontal: '━',

  // Effort level circles
  effortLow: '○',
  effortMedium: '◐',
  effortHigh: '●',
  effortMax: '◉',

  // Spinner frames
  spinnerFrames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
};
