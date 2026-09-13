import { platform } from 'node:os';

const isDarwin = platform() === 'darwin';

/**
 * Unicode symbols and indicators used throughout the TUI.
 */
export const figures = {
  // Main markers
  blackCircle: '●',
  bullet: '·',
  bulletSmall: '∙',
  teardropAsterisk: '✻', // For reasoning / thinking indicator
  asterisk: '*',
  threeDots: '∴', // Reasoning glyph
  treeBranch: '└', // Tree connector
  treeVertical: '│',
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
  dashedLine: '╌',

  // Effort level circles
  effortLow: '○',
  effortMedium: '◐',
  effortHigh: '●',
  effortMax: '◉',

  // Spinner frames
  spinnerFrames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
};
