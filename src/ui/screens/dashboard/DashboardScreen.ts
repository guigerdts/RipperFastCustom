import { translate, LOCALE_LABELS } from '../../../i18n';
import type { AppContext } from '../../../app/context';
import { APP_NAME, APP_VERSION, DECLARED_MANIFEST_VERSION } from '../../../constants/app';
import { Badge, Card, StatusRow } from '../../components';
import { el } from '../../dom';

export function DashboardScreen(context: AppContext): HTMLElement {
  const { i18n, environment, host } = context;
  const t = i18n.t.bind(i18n);
  const na = t('common.notAvailable');

  const capabilities = host.capabilities.report();
  const count = (state: string): number =>
    capabilities.filter((capability) => capability.state === state).length;

  const activeDoc = host.documents.getActiveDocumentInfo();
  const width = activeDoc?.width ?? null;
  const height = activeDoc?.height ?? null;
  const resolution = activeDoc?.resolution ?? null;

  const connectionCard = Card(t('dashboard.connection'), [
    StatusRow(
      t('dashboard.connection'),
      host.available
        ? Badge(t('dashboard.connection.online'), 'ok')
        : Badge(t('dashboard.connection.offline'), 'danger'),
    ),
    StatusRow(t('dashboard.photoshopVersion'), environment.hostVersion ?? na),
    StatusRow(t('dashboard.uxpVersion'), environment.uxpVersion ?? na),
    StatusRow(
      t('dashboard.apiVersion'),
      host.capabilities.apiVersion !== null ? String(host.capabilities.apiVersion) : na,
    ),
    StatusRow(t('dashboard.manifestVersion'), String(DECLARED_MANIFEST_VERSION)),
    StatusRow(t('common.language'), LOCALE_LABELS[i18n.locale] ?? i18n.locale),
  ]);

  const documentChildren =
    activeDoc && width !== null && height !== null
      ? [
          StatusRow(t('dashboard.activeDocument'), activeDoc.name ?? t('common.noDocument')),
          StatusRow(t('dashboard.dimensions'), `${width} × ${height} px`),
          StatusRow(t('dashboard.resolution'), resolution !== null ? `${resolution} ppi` : na),
        ]
      : [
          StatusRow(t('dashboard.activeDocument'), t('common.noDocument')),
          el('p', { className: 'rfc-screen__subtitle', text: t('dashboard.noDocumentHint') }),
        ];

  const capabilityGrid = el(
    'div',
    { className: 'rfc-cap-grid' },
    capabilities.map((capability) => {
      const labelKey =
        capability.state === 'available'
          ? 'common.available'
          : capability.state === 'unavailable'
            ? 'common.unavailable'
            : 'common.unknown';
      const tone =
        capability.state === 'available'
          ? 'ok'
          : capability.state === 'unavailable'
            ? 'danger'
            : 'muted';
      return el('div', { className: 'rfc-cap-item' }, [
        el('span', { className: 'rfc-cap-item__id', text: capability.id }),
        Badge(translate(i18n.locale, labelKey), tone),
      ]);
    }),
  );

  const capabilitiesCard = Card(t('dashboard.capabilities'), [
    el('p', {
      className: 'rfc-screen__subtitle',
      text: t('dashboard.capabilitiesSummary', {
        available: count('available'),
        unavailable: count('unavailable'),
        unknown: count('unknown'),
      }),
    }),
    capabilityGrid,
  ]);

  return el('div', { className: 'rfc-stack' }, [
    el('h1', { className: 'rfc-screen__title', text: t('dashboard.title') }),
    el('p', { className: 'rfc-screen__subtitle', text: `${APP_NAME} ${APP_VERSION}` }),
    connectionCard,
    Card(t('dashboard.activeDocument'), documentChildren),
    capabilitiesCard,
  ]);
}
