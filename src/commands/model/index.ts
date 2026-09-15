import { ALL_PROVIDER_NAMES, saveSettings } from '../../config/index.js';
import { fetchAvailableModels, type ModelDescriptor } from '../../models/index.js';
import type { CommandContext, CommandResult, SlashCommand } from '../types.js';

/**
 * /model slash command: opens interactive model picker dock when invoked with no args,
 * or switches model directly and persists preference to ~/.chuck/settings.json.
 */
export const modelCommand: SlashCommand = {
  name: 'model',
  description: 'View or switch the active model with interactive model picker',
  usage: '/model [model_id | provider model_id]',

  async execute(args: string[], context: CommandContext): Promise<CommandResult> {
    const current = context.session.getModel();

    // 1. If no args provided, trigger interactive ModelPicker dock
    if (args.length === 0) {
      const discovery = await fetchAvailableModels();
      return {
        handled: true,
        data: {
          showModelPicker: true,
          models: discovery.models,
          current,
        },
      };
    }

    // 2. Switching model: support both "/model <model_id>" and "/model <provider> <model_id>"
    let targetProvider: string | undefined;
    let targetModelId: string;

    const validProviders: readonly string[] = ALL_PROVIDER_NAMES;

    if (args.length === 1) {
      targetModelId = args[0].trim();
    } else {
      const first = args[0].trim().toLowerCase();
      if (validProviders.includes(first)) {
        targetProvider = first;
        targetModelId = args.slice(1).join(' ').trim();
      } else {
        targetModelId = args.join(' ').trim();
      }
    }

    // 3. Validate against discovered models
    const discovery = await fetchAvailableModels();
    const matches = discovery.models.filter((m: ModelDescriptor) => {
      const idMatch =
        m.model_id.toLowerCase() === targetModelId.toLowerCase() ||
        m.model_id.toLowerCase().includes(targetModelId.toLowerCase());
      if (targetProvider) {
        return m.provider === targetProvider && idMatch;
      }
      return idMatch;
    });

    if (matches.length === 0) {
      return {
        handled: true,
        message: `Model "${targetModelId}" was not found among available models.\nType "/model" to open the interactive model picker.`,
      };
    }

    // Pick exact match if available, otherwise first match
    const selected =
      matches.find(
        (m: ModelDescriptor) => m.model_id.toLowerCase() === targetModelId.toLowerCase(),
      ) ?? matches[0];

    // 4. Update session
    context.session.setModel({
      provider: selected.provider,
      modelId: selected.model_id,
    });

    // 5. Save to ~/.chuck/settings.json
    saveSettings({
      model: {
        provider: selected.provider,
        modelId: selected.model_id,
      },
    });

    return {
      handled: true,
      message: `Active model switched to ${selected.provider}/${selected.modelId} and saved to ~/.chuck/settings.json.`,
      data: { selected },
    };
  },
};
