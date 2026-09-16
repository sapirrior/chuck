import stringWidth from 'string-width';

/**
 * Unicode ANSI art logo lines for the header.
 * Each line is consistently padded to guarantee uniform column alignment.
 */
export const LOGO_LINES = [' ▄▄▄▄▄ ', '▀▙███▟▀', ' ▘▘ ▝▝ '] as const;

/**
 * Maximum visible width of the logo block.
 */
export const LOGO_WIDTH = Math.max(...LOGO_LINES.map((line) => stringWidth(line)));
