import { VERSION } from '../version/index.js';
import { REPO_URL } from '../repo/index.js';

export function handleHelpCommand(): void {
  console.log(`steward ${VERSION} - An engineering terminal assistant

Usage:
  steward                       Start interactive TUI session
  steward --config              View all current configurations
  steward --config voice <lang> Configure preferred voice language (e.g. en, es, ja, en-US)
  steward --repo                Print GitHub repository URL
  steward --version, -v         Display version
  steward --help, -h            Display this help menu

Repository:
  ${REPO_URL}
`);
  process.exit(0);
}
