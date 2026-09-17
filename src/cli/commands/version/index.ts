import pkg from '../../../../package.json' with { type: 'json' };

export const VERSION: string = pkg.version || '0.0.0';

export function handleVersionCommand(): void {
  console.log(`steward ${VERSION}`);
  process.exit(0);
}
