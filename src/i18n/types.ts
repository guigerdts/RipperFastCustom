/** Supported UI locales. Spanish is the canonical source of truth. */
export type Locale = 'es' | 'en';

export const LOCALES = ['es', 'en'] as const satisfies readonly Locale[];

export const DEFAULT_LOCALE: Locale = 'es';

/**
 * Endonyms: each language is always named in itself, so these labels are not
 * translated.
 */
export const LOCALE_LABELS: Readonly<Record<Locale, string>> = { es: 'Español', en: 'English' };

export type TranslationParams = Readonly<Record<string, string | number>>;
