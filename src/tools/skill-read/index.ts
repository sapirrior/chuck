import { z } from 'zod';
import { readSkillResource, type SkillReadOutput } from '../../skills/index.js';
import type { ToolDefinition } from '../types.js';

const skillReadParamsSchema = z.object({
  name: z.string().min(1, 'Skill name is required'),
  path: z.string().optional(),
});

export type SkillReadParams = z.infer<typeof skillReadParamsSchema>;

export const skillReadTool: ToolDefinition<typeof skillReadParamsSchema, SkillReadOutput> = {
  name: 'SkillRead',
  displayName: 'SkillRead',
  icon: '📖',
  description:
    'Loads and reads the instructions (SKILL.md) or a relative resource file of a specialized skill by name. Use this when a task requires specialized guidelines.',
  parameters: skillReadParamsSchema,

  summarizeArgs(args) {
    if (args.path) {
      return `name="${args.name}" path="${args.path}"`;
    }
    return `name="${args.name}"`;
  },

  async execute(args, context) {
    const cwd = context?.cwd ?? process.cwd();
    return readSkillResource(args.name, args.path, cwd);
  },

  summarize(args, result) {
    const target = args.path ? `${args.name}/${args.path}` : args.name;
    const len = result?.content ? ` (${result.content.length} bytes)` : '';
    return `SkillRead: ${target}${len}`;
  },
};
