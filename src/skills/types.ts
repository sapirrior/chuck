export interface Skill {
  name: string;
  description: string;
  filePath: string;
  dirPath: string;
  source: 'workspace' | 'user-agents' | 'user-steward';
}
