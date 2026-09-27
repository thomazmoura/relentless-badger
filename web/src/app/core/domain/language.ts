/** A language the UI and the reminders can speak. */
export type Language = 'en' | 'pt';

/**
 * What the user picked in Settings. `system` follows the browser, which is what
 * a fresh install does. Local to this browser like the sound: two devices owned
 * by the same person may well be set to different languages.
 */
export type LanguagePreference = 'system' | Language;

export const LANGUAGE_PREFERENCES: readonly LanguagePreference[] = ['system', 'en', 'pt'];

/** The stored preference, or `system` when nothing usable is stored. */
export function parseLanguagePreference(stored: string | null | undefined): LanguagePreference {
  return LANGUAGE_PREFERENCES.find((option) => option === stored) ?? 'system';
}

/**
 * The language to speak. Following the device means Portuguese for any `pt`
 * locale, Brazil or Portugal alike, and English for everything else — the only
 * other language on offer.
 */
export function resolveLanguage(
  preference: LanguagePreference,
  deviceLanguageTag: string,
): Language {
  if (preference !== 'system') return preference;
  return deviceLanguageTag.toLowerCase().startsWith('pt') ? 'pt' : 'en';
}

/** The browser's own language, the web's stand-in for the device locale. */
export function deviceLanguageTag(): string {
  return typeof navigator === 'undefined' ? 'en' : navigator.language;
}

/** A language's name in that language, the same whatever the UI speaks. */
export function languageName(language: Language): string {
  return language === 'pt' ? 'Português' : 'English';
}
