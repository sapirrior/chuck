export type CliCommandKind = 'start' | 'version' | 'help' | 'repo' | 'config';

export interface CliConfigArgs {
  target: 'all' | 'voice' | 'model';
  value?: string;
}

export interface ParsedCliArgs {
  command: CliCommandKind;
  configArgs?: CliConfigArgs;
  rawArgs: string[];
}
