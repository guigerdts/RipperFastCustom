import { APP_MANIFEST_ID, APP_VERSION } from '../../../constants/app';
import { LOCALES, LOCALE_LABELS, type Locale } from '../../../i18n';
import type { AppContext } from '../../../app/context';
import { Card, StatusRow } from '../../components';
import { el } from '../../dom';

export function SettingsScreen(context: AppContext): HTMLElement {
  const { i18n } = context;

  const select = el('select', { className: 'rfc-select', attrs: { id: 'rfc-locale-select' } });
  for (const locale of LOCALES) {
    const option = el('option', { text: LOCALE_LABELS[locale], attrs: { value: locale } });
    if (locale === i18n.locale) option.selected = true;
    select.appendChild(option);
  }
  select.addEventListener('change', () => {
    const next = select.value;
    if ((LOCALES as readonly string[]).includes(next)) i18n.setLocale(next as Locale);
  });

  const languageCard = Card(i18n.t('settings.language'), [
    el('div', { className: 'rfc-field' }, [
      el('label', {
        className: 'rfc-field__label',
        attrs: { for: 'rfc-locale-select' },
        text: i18n.t('common.language'),
      }),
      select,
    ]),
    el('p', { className: 'rfc-screen__subtitle', text: i18n.t('settings.languageHint') }),
  ]);

  const aboutCard = Card(i18n.t('settings.runtime'), [
    StatusRow(i18n.t('settings.pluginId'), APP_MANIFEST_ID),
    StatusRow(i18n.t('settings.version'), APP_VERSION),
    StatusRow(i18n.t('settings.storage'), i18n.t('settings.storageValue')),
  ]);

  return el('div', { className: 'rfc-stack' }, [
    el('h1', { className: 'rfc-screen__title', text: i18n.t('settings.title') }),
    el('p', { className: 'rfc-screen__subtitle', text: i18n.t('app.tagline') }),
    languageCard,
    aboutCard,
  ]);
}
