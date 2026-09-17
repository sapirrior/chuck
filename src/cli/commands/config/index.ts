import {
  getSettingsPath,
  loadSettings,
  getVoiceLanguage,
  saveVoiceLanguage,
  getSavedModel,
} from '../../../config/settings.js';
import type { CliConfigArgs } from '../../types.js';
import { resolveVoiceLanguage, getLanguageDisplayName } from './utils/lang.js';

export function handleConfigCommand(configArgs: CliConfigArgs): void {
  if (configArgs.target === 'all') {
    const settingsPath = getSettingsPath();
    const voiceLang = getVoiceLanguage();
    const voiceDisplay = voiceLang
      ? `${getLanguageDisplayName(voiceLang)} (${voiceLang})`
      : 'auto-detect (default)';

    const savedModel = getSavedModel();
    const modelDisplay = savedModel
      ? `${savedModel.provider}:${savedModel.modelId} (effort: ${savedModel.effort ?? 'provider-default'})`
      : 'not configured (using environment priority)';

    console.log(`Steward Configuration (${settingsPath}):`);
    console.log(`  Voice Language: ${voiceDisplay}`);
    console.log(`  Saved Model:    ${modelDisplay}`);
    process.exit(0);
  }

  if (configArgs.target === 'voice') {
    const rawLang = configArgs.value?.trim();
    if (!rawLang) {
      const current = getVoiceLanguage();
      if (current) {
        const name = getLanguageDisplayName(current);
        console.log(`Current voice language: ${name} (${current})`);
      } else {
        console.log('Current voice language: auto-detect (default)');
      }
      process.exit(0);
    }

    const resolved = resolveVoiceLanguage(rawLang);
    if (!resolved) {
      console.error(
        `Error: Unknown voice language "${rawLang}".\n` +
          `Examples of valid options:\n` +
          `  steward --config voice en       (English / US)\n` +
          `  steward --config voice es       (Spanish)\n` +
          `  steward --config voice ja       (Japanese)\n` +
          `  steward --config voice fr       (French)\n` +
          `  steward --config voice de       (German)\n` +
          `  steward --config voice zh       (Chinese)\n` +
          `  steward --config voice en-GB    (British English)\n` +
          `  steward --config voice es-MX    (Mexican Spanish)`,
      );
      process.exit(1);
    }

    saveVoiceLanguage(resolved.tag);
    console.log(`✓ Voice language configured: ${resolved.name} (${resolved.tag})`);
    process.exit(0);
  }
}
