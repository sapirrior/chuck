import { useState, useEffect } from 'react';
import { defaultCommandRegistry } from '../../commands/registry.js';
import type { SlashCommand } from '../../commands/types.js';
import { searchWorkspaceFiles } from '../utils/file-search.js';

export interface UseInputCompletionsOptions {
  value: string;
  cursorPos: number;
  cwd: string;
}

export function useInputCompletions({ value, cursorPos, cwd }: UseInputCompletionsOptions) {
  const [fileMatches, setFileMatches] = useState<string[]>([]);
  const [fileSelectIdx, setFileSelectIdx] = useState(0);
  const [paletteIdx, setPaletteIdx] = useState(0);

  // Check @ query at cursor
  const prefix = value.slice(0, cursorPos);
  const lastAt = prefix.lastIndexOf('@');
  let atData: { query: string; atIndex: number } | null = null;

  if (
    lastAt !== -1 &&
    (lastAt === 0 || prefix[lastAt - 1] === ' ' || prefix[lastAt - 1] === '\t')
  ) {
    const query = prefix.slice(lastAt + 1);
    if (!query.includes(' ') && !query.includes('\t')) {
      atData = { query, atIndex: lastAt };
    }
  }

  // Trigger workspace search on @
  useEffect(() => {
    if (atData) {
      let active = true;
      searchWorkspaceFiles(cwd, atData.query).then((matches) => {
        if (active) {
          setFileMatches(matches);
          setFileSelectIdx(0);
        }
      });
      return () => {
        active = false;
      };
    } else {
      setFileMatches([]);
    }
  }, [atData?.query, cwd]);

  // Slash commands filtering
  const allCommands = defaultCommandRegistry.getAll();
  const isSlashMode = value.startsWith('/') && !value.includes(' ');
  const matchingCommands: SlashCommand[] = isSlashMode
    ? allCommands.filter((c) => `/${c.name}`.toLowerCase().startsWith(value.toLowerCase()))
    : [];

  return {
    atData,
    fileMatches,
    setFileMatches,
    fileSelectIdx,
    setFileSelectIdx,
    isSlashMode,
    matchingCommands,
    paletteIdx,
    setPaletteIdx,
  };
}
