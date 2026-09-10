import { platform } from 'node:os';

const isDarwin = platform() === 'darwin';

/**
 * Unicode symbols and indicators matching Claude Code's design system.
 */
export const figures = {
  // Main markers
  blackCircle: isDarwin ? '⏺' : '●',
  bullet: '∙',
  teardropAsterisk: '✻', // For reasoning / thinking indicator
  pointer: '❯',
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
