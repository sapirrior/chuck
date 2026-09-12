export interface KeyAction {
  type:
    | 'insert'
    | 'newline'
    | 'backspace'
    | 'delete'
    | 'delete-word'
    | 'clear-line'
    | 'cursor-left'
    | 'cursor-right'
    | 'cursor-word-left'
    | 'cursor-word-right'
    | 'cursor-home'
    | 'cursor-end'
    | 'cursor-up'
    | 'cursor-down'
    | 'submit'
    | 'escape'
    | 'tab'
    | 'other';
  char?: string;
  raw: string;
}

export function parseKeyInput(chunk: Buffer | string): KeyAction {
  const str = typeof chunk === 'string' ? chunk : chunk.toString();

  // Escape
  if (str === '\x1b') return { type: 'escape', raw: str };

  // Enter / Return
  if (str === '\r' || str === '\n') return { type: 'submit', raw: str };

  // Tab
  if (str === '\t') return { type: 'tab', raw: str };

  // Multiline Newlines (Shift+Enter, Alt+Enter, Ctrl+Enter)
  if (
    str === '\x1b\r' ||
    str === '\x1b\n' ||
    str === '\x1b[13;2u' ||
    str === '\x1b[27;2;13~' ||
    str === '\x1b[13;5u' ||
    str === '\x1b[13;6u' ||
    str === '\x1bOM'
  ) {
    return { type: 'newline', raw: str };
  }

  // Arrow Keys
  if (str === '\x1b[A') return { type: 'cursor-up', raw: str };
  if (str === '\x1b[B') return { type: 'cursor-down', raw: str };
  if (str === '\x1b[D') return { type: 'cursor-left', raw: str };
  if (str === '\x1b[C') return { type: 'cursor-right', raw: str };

  // Word jumps
  if (str === '\x1bb' || str === '\x1b[1;5D' || str === '\x1b[1;3D' || str === '\x1b[5D') {
    return { type: 'cursor-word-left', raw: str };
  }
  if (str === '\x1bf' || str === '\x1b[1;5C' || str === '\x1b[1;3C' || str === '\x1b[5C') {
    return { type: 'cursor-word-right', raw: str };
  }

  // Home / End
  if (str === '\x1b[H' || str === '\x1b[1~' || str === '\x1b[7~' || str === '\x01') {
    return { type: 'cursor-home', raw: str };
  }
  if (str === '\x1b[F' || str === '\x1b[4~' || str === '\x1b[8~' || str === '\x05') {
    return { type: 'cursor-end', raw: str };
  }

  // Backspace & Deletion
  if (str === '\x7f' || str === '\x08') return { type: 'backspace', raw: str };
  if (str === '\x1b[3~') return { type: 'delete', raw: str };
  if (str === '\x17' || str === '\x1b\x7f' || str === '\x1b\x08') {
    return { type: 'delete-word', raw: str };
  }
  if (str === '\x15' || str === '\x0b') return { type: 'clear-line', raw: str };

  // Single printable characters
  if (str.length === 1 && str.charCodeAt(0) >= 32) {
    return { type: 'insert', char: str, raw: str };
  }

  // Multi-byte text paste / insertion
  if (str.length > 1 && !str.startsWith('\x1b')) {
    return { type: 'insert', char: str, raw: str };
  }

  return { type: 'other', raw: str };
}
