import { parseReasoningEffort } from '../../engine/model-provider.js';
import type { CommandContext, CommandResult, SlashCommand } from '../types.js';

const EFFORT_HELP = `Reasoning Effort Levels:
  0 : provider-default (use provider default)
  1 : none             (disable reasoning/thinking)
  2 : minimal          (bare-minimum reasoning)
  3 : low              (fast, concise reasoning)
  4 : medium           (balanced reasoning)
  5 : high             (thorough reasoning)
  6 : xhigh            (maximum reasoning)

Usage:
  /effort             - View current effort level
  /effort <0..6>      - Set effort by number
  /effort <name>      - Set effort by name (e.g. /effort high, /effort none)`;

/**
 * /effort slash command: view or set reasoning/thinking effort level for models.
 */
export const effortCommand: SlashCommand = {
  name: 'effort',
  description:
    'View or set model reasoning effort (0: default, 1: none, 2: minimal, 3: low, 4: med, 5: high, 6: xhigh)',
  usage: '/effort [0..6 | none | minimal | low | medium | high | xhigh | default]',

  async execute(args: string[], context: CommandContext): Promise<CommandResult> {
    const currentEffort = context.session.getEffort();

    if (args.length === 0) {
      return {
        handled: true,
        message: `Current reasoning effort: "${currentEffort}"\n\n${EFFORT_HELP}`,
      };
    }

    const input = args[0]?.trim();
    const parsed = parseReasoningEffort(input);

    if (!parsed) {
      return {
        handled: true,
        message: `Invalid effort level "${input}".\n\n${EFFORT_HELP}`,
      };
    }

    context.session.setEffort(parsed);

    return {
      handled: true,
      message: `Reasoning effort set to "${parsed}" and saved to ~/.chuck/settings.json.`,
      data: { effort: parsed },
    };
  },
};
