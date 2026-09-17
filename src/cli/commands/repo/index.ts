export const REPO_URL = 'https://github.com/sapirrior/steward';

export function handleRepoCommand(): void {
  console.log(REPO_URL);
  process.exit(0);
}
