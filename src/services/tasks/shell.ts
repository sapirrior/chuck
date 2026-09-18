/**
 * Returns the platform-appropriate shell executable and invocation arguments.
 */
export function getPlatformShell(): { shell: string; args: string[] } {
  if (process.platform === 'win32') {
    return {
      shell: process.env.COMSPEC || 'powershell.exe',
      args: ['-NoProfile', '-NonInteractive', '-Command'],
    };
  }

  const userShell = process.env.SHELL || '/bin/sh';
  return {
    shell: userShell,
    args: ['-c'],
  };
}
