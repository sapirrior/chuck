import { saveSettings } from '../config/index.js';
import { fetchAvailableModels, type ModelDescriptor } from '../models/index.js';
import type { CommandContext, CommandResult, SlashCommand } from './types.js';

/**
 * Formats the list of available models cleanly for terminal display.
 */
function formatModelList(
  models: ModelDescriptor[],
  currentModel: { provider: string; modelId: string },
): string {
  if (models.length === 0) {
    return 'No models available. Please configure your API keys (e.g. GEMINI_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY).';
  }

  const lines: string[] = [];
  lines.push('Available Models:');

  // Group by provider
  const groups = new Map<string, ModelDescriptor[]>();
  for (const model of models) {
    const list = groups.get(model.provider) ?? [];
    list.push(model);
    groups.set(model.provider, list);
  }

  for (const [provider, list] of groups.entries()) {
    lines.push(`\n[${provider.toUpperCase()}]`);
    for (const m of list) {
      const isCurrent = m.provider === currentModel.provider && m.model_id === currentModel.modelId;
      const marker = isCurrent ? ' (active)' : '';
      lines.push(`  - ${m.model_id}${marker}`);
    }
  }

  lines.push('\nUsage:');
  lines.push('  /model <model_id>             Switch to a model (auto-detects provider)');
  lines.push('  /model <provider> <model_id>  Switch to model with explicit provider');

  return lines.join('\n');
}

/**
 * /model slash command: views active model, lists available models,
 * or switches model and persists preference to ~/.xd/settings.json.
 */
export const modelCommand: SlashCommand = {
  name: 'model',
  description: 'View or switch the active model and save preference to settings',
  usage: '/model [model_id | provider model_id]',

  async execute(args: string[], context: CommandContext): Promise<CommandResult> {
    const current = context.session.getModel();

    // 1. If no args provided, show current model and list available models
    if (args.length === 0) {
      const discovery = await fetchAvailableModels();
      const listing = formatModelList(discovery.models, current);
      return {
        handled: true,
        message: `Current Model: ${current.provider}/${current.modelId}\n\n${listing}`,
        data: { current, models: discovery.models },
      };
    }

    // 2. Switching model: support both "/model <model_id>" and "/model <provider> <model_id>"
    let targetProvider: string | undefined;
    let targetModelId: string;

    const validProviders = ['gemini', 'anthropic', 'openai', 'custom'];

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
        message: `Model "${targetModelId}" was not found among available models.\nType "/model" to see the list of available models.`,
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

    // 5. Save to ~/.xd/settings.json
    saveSettings({
      model: {
        provider: selected.provider,
        modelId: selected.model_id,
      },
    });

    return {
      handled: true,
      message: `Active model switched to ${selected.provider}/${selected.model_id} and saved to ~/.xd/settings.json.`,
      data: { selected },
    };
  },
};
