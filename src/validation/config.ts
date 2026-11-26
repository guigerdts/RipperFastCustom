import { DEFAULT_LOCALE, LOCALES, type Locale } from '../i18n/types';

/** Runtime configuration the plugin persists between screens (not sessions). */
export interface AppConfig {
  readonly locale: Locale;
}

export const DEFAULT_APP_CONFIG: AppConfig = { locale: DEFAULT_LOCALE };

function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * Validates raw stored configuration field by field. Invalid or missing fields
 * fall back to their default instead of failing the whole configuration, so a
 * corrupt value can never prevent the plugin from starting.
 */
export function validateAppConfig(raw: unknown): { config: AppConfig; issues: readonly string[] } {
  if (typeof raw !== 'object' || raw === null) {
    return { config: DEFAULT_APP_CONFIG, issues: ['config must be an object; using defaults'] };
  }

  const source = raw as Record<string, unknown>;
  const issues: string[] = [];
  const locale = source['locale'];

  if (locale === undefined) {
    issues.push('locale missing; using default');
  } else if (!isLocale(locale)) {
    issues.push(`locale "${String(locale)}" is not supported; using default`);
  }

  const config: AppConfig = { locale: isLocale(locale) ? locale : DEFAULT_APP_CONFIG.locale };
  return { config, issues };
}
