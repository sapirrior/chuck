/**
 * Common language aliases mapping simple inputs to standard BCP-47 language tags.
 */
export const COMMON_LANGUAGE_ALIASES: Record<string, string> = {
  // 2-letter codes -> default regional tags
  en: 'en-US',
  es: 'es-ES',
  ja: 'ja-JP',
  zh: 'zh-CN',
  fr: 'fr-FR',
  de: 'de-DE',
  hi: 'hi-IN',
  pt: 'pt-BR',
  ko: 'ko-KR',
  ru: 'ru-RU',
  it: 'it-IT',
  ar: 'ar-SA',
  nl: 'nl-NL',
  tr: 'tr-TR',
  pl: 'pl-PL',
  sv: 'sv-SE',
  vi: 'vi-VN',
  th: 'th-TH',
  id: 'id-ID',

  // Natural language names
  english: 'en-US',
  spanish: 'es-ES',
  japanese: 'ja-JP',
  chinese: 'zh-CN',
  mandarin: 'zh-CN',
  french: 'fr-FR',
  german: 'de-DE',
  hindi: 'hi-IN',
  portuguese: 'pt-BR',
  korean: 'ko-KR',
  russian: 'ru-RU',
  italian: 'it-IT',
  arabic: 'ar-SA',
  dutch: 'nl-NL',
  turkish: 'tr-TR',
  polish: 'pl-PL',
  swedish: 'sv-SE',
  vietnamese: 'vi-VN',
  thai: 'th-TH',
  indonesian: 'id-ID',
};

/**
 * Gets the human-readable English display name for a language tag.
 */
export function getLanguageDisplayName(tag: string): string {
  try {
    const dn = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' });
    return dn.of(tag) || tag;
  } catch {
    return tag;
  }
}

/**
 * Resolves simple inputs (e.g. "en", "english", "ja", "es-mx", "en us") into a canonical BCP-47 tag.
 * Returns { tag, name } or null if unrecognized.
 */
export function resolveVoiceLanguage(input: string): { tag: string; name: string } | null {
  if (!input || typeof input !== 'string') return null;
  const rawClean = input
    .trim()
    .toLowerCase()
    .replace(/[_\s-]+/g, '');
  if (!rawClean) return null;

  // 1. Direct alias match (e.g. "en" -> "en-US", "english" -> "en-US", "ja" -> "ja-JP")
  if (COMMON_LANGUAGE_ALIASES[rawClean]) {
    const tag = COMMON_LANGUAGE_ALIASES[rawClean]!;
    const name = getLanguageDisplayName(tag);
    return { tag, name };
  }

  // 2. Normalized BCP-47 tag (e.g. "en-GB", "es-MX", "zh-TW", "pt-PT")
  const hyphenated = input.trim().replace(/[_\s]+/g, '-');
  try {
    const canonical = Intl.getCanonicalLocales(hyphenated)[0];
    if (canonical) {
      const loc = new Intl.Locale(canonical);
      if (loc.language && loc.language !== 'root') {
        const name = getLanguageDisplayName(canonical);
        if (name) {
          return { tag: canonical, name };
        }
      }
    }
  } catch {
    // Fall through
  }

  return null;
}
