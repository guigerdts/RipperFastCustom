import { describe, expect, it } from 'vitest';
import { en } from '../../src/i18n/en';
import { es, type TranslationKey } from '../../src/i18n/es';
import { createI18n, LOCALE_LABELS, LOCALES, translate } from '../../src/i18n';

describe('i18n dictionaries', () => {
  it('exposes exactly the same keys in Spanish and English', () => {
    const spanishKeys = Object.keys(es).sort();
    const englishKeys = Object.keys(en).sort();
    expect(englishKeys).toEqual(spanishKeys);
  });

  it('has no empty translations', () => {
    for (const dictionary of [es, en]) {
      for (const [key, value] of Object.entries(dictionary)) {
        expect(value.trim().length, `${key} must not be empty`).toBeGreaterThan(0);
      }
    }
  });

  it('covers every supported locale with an endonym', () => {
    for (const locale of LOCALES) {
      expect(LOCALE_LABELS[locale]).toBeTruthy();
    }
  });
});

describe('translate', () => {
  it('defaults to Spanish', () => {
    expect(translate('es', 'nav.settings')).toBe('Ajustes');
  });

  it('translates to English', () => {
    expect(translate('en', 'nav.settings')).toBe('Settings');
  });

  it('keeps the English dictionary complete at compile time', () => {
    // Type-level assertion: a missing key fails `npm run typecheck`.
    const complete: Record<TranslationKey, string> = en;
    expect(Object.keys(complete).length).toBe(Object.keys(es).length);
  });

  it('interpolates named parameters', () => {
    expect(translate('es', 'pending.description', { module: 'Preflight' })).toContain('Preflight');
    expect(
      translate('en', 'dashboard.capabilitiesSummary', {
        available: 2,
        unavailable: 3,
        unknown: 4,
      }),
    ).toBe('2 available · 3 not available · 4 undetermined');
  });

  it('leaves unknown placeholders untouched', () => {
    expect(translate('es', 'pending.description', { other: 'x' })).toContain('{module}');
  });
});

describe('createI18n', () => {
  it('starts on the default locale', () => {
    expect(createI18n().locale).toBe('es');
  });

  it('falls back to the default locale for an unsupported initial value', () => {
    expect(createI18n('fr' as never).locale).toBe('es');
  });

  it('switches language without recreating the service', () => {
    const i18n = createI18n();
    i18n.setLocale('en');
    expect(i18n.locale).toBe('en');
    expect(i18n.t('nav.dashboard')).toBe('Dashboard');
  });

  it('ignores unsupported locale changes', () => {
    const i18n = createI18n();
    i18n.setLocale('de' as never);
    expect(i18n.locale).toBe('es');
  });

  it('notifies subscribers exactly once per change', () => {
    const i18n = createI18n();
    const seen: string[] = [];
    const unsubscribe = i18n.subscribe((locale) => seen.push(locale));
    i18n.setLocale('en');
    i18n.setLocale('en');
    unsubscribe();
    i18n.setLocale('es');
    expect(seen).toEqual(['en']);
  });
});
