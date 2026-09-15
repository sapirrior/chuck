import { writeFileSync } from 'node:fs';
import { z } from 'zod';
import { resolveSafePath } from '../safe-paths.js';
import type { ToolDefinition } from '../types.js';

export const WriteArtifactParamsSchema = z.object({
  path: z
    .string()
    .describe(
      'Relative path for the artifact inside .steward/artifacts/ (e.g. "src/engine.ts" or "README.md")',
    ),
  content: z.string().describe('Full text content to write to the artifact file'),
});

export type WriteArtifactParams = z.infer<typeof WriteArtifactParamsSchema>;

export interface WriteArtifactResult {
  path: string;
  linesWritten: number;
  bytesWritten: number;
  message: string;
}

export const writeArtifactTool: ToolDefinition<
  typeof WriteArtifactParamsSchema,
  WriteArtifactResult
> = {
  name: 'write_artifact',
  displayName: 'Write Artifact',
  icon: '✎',
  description:
    'Creates or overwrites an artifact file inside the .steward/artifacts/ directory. Never modifies the host project directly.',
  parameters: WriteArtifactParamsSchema,
  confirmationPolicy: 'never',

  summarizeArgs: (args) => JSON.stringify({ path: args.path }),

  async execute(args, context): Promise<WriteArtifactResult> {
    const { resolvedPath, displayPath } = resolveSafePath(context.cwd, args.path, 'artifact');
    const content = args.content ?? '';
    const bytesWritten = Buffer.byteLength(content, 'utf-8');
    const linesWritten = content ? content.split(/\r?\n/).length : 0;

    writeFileSync(resolvedPath, content, 'utf-8');

    return {
      path: displayPath,
      linesWritten,
      bytesWritten,
      message: `Wrote ${linesWritten} lines to ${displayPath}`,
    };
  },

  summarize: (args, result) => {
    return result ? result.message : `write_artifact(${args.path})`;
  },
};
