import { en } from './en';
import { es, type TranslationKey } from './es';
import {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_LABELS,
  type Locale,
  type TranslationParams,
} from './types';

export type { Locale, TranslationKey, TranslationParams };
export { DEFAULT_LOCALE, LOCALES, LOCALE_LABELS };

export type TranslationDictionary = Readonly<Partial<Record<TranslationKey, string>>>;

export interface I18nService {
  readonly locale: Locale;
  t(key: TranslationKey, params?: TranslationParams): string;
  setLocale(locale: Locale): void;
  subscribe(listener: (locale: Locale) => void): () => void;
}

const DICTIONARIES: Readonly<Record<Locale, TranslationDictionary>> = { es, en };

function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

export function translate(locale: Locale, key: TranslationKey, params?: TranslationParams): string {
  const primary = DICTIONARIES[locale][key];
  const fallback = es[key];
  return interpolate(primary ?? fallback, params);
}

export function createI18n(initial: Locale = DEFAULT_LOCALE): I18nService {
  let locale: Locale = LOCALES.includes(initial) ? initial : DEFAULT_LOCALE;
  const listeners = new Set<(l: Locale) => void>();

  return {
    get locale() {
      return locale;
    },
    t(key, params) {
      return translate(locale, key, params);
    },
    setLocale(next) {
      if (!LOCALES.includes(next) || next === locale) return;
      locale = next;
      for (const listener of listeners) listener(locale);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
