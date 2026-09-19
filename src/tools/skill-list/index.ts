import { z } from 'zod';
import { discoverSkills, type Skill } from '../../skills/index.js';
import type { ToolDefinition } from '../types.js';

const skillListParamsSchema = z.object({});

export type SkillListParams = z.infer<typeof skillListParamsSchema>;

export interface SkillSummaryItem {
  name: string;
  description: string;
  source: Skill['source'];
}

export const skillListTool: ToolDefinition<typeof skillListParamsSchema, SkillSummaryItem[]> = {
  name: 'SkillList',
  displayName: 'SkillList',
  icon: '💡',
  description:
    'Discovers and lists all available specialized skills and their descriptions. Use this when you need specialized domain knowledge or workflows.',
  parameters: skillListParamsSchema,

  summarizeArgs() {
    return '';
  },

  async execute(_args, context) {
    const cwd = context?.cwd ?? process.cwd();
    const skills = discoverSkills(cwd);
    return skills
      .map((s) => ({
        name: s.name,
        description: s.description,
        source: s.source,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  summarize(_args, result) {
    const count = result?.length ?? 0;
    if (count === 0) {
      return 'Discovered 0 skills';
    }
    return `Discovered ${count} skill${count === 1 ? '' : 's'}`;
  },
};
