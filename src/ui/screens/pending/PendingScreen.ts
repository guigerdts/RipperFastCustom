import type { AppContext } from '../../../app/context';
import type { ModuleId } from '../../../modules/types';
import { getModule } from '../../../modules/registry';
import { Badge, EmptyState } from '../../components';
import { el } from '../../dom';

/**
 * Honest placeholder for sections that are declared but not implemented.
 * It renders the module contract state — never simulated functionality.
 */
export function PendingScreen(context: AppContext, moduleId: ModuleId): HTMLElement {
  const { i18n } = context;
  const module = getModule(moduleId);
  const title = module ? i18n.t(module.labelKey) : i18n.t('pending.title');

  return el('div', { className: 'rfc-stack' }, [
    el('h1', { className: 'rfc-screen__title', text: title }),
    el('p', { className: 'rfc-screen__subtitle', text: i18n.t('pending.notice') }),
    EmptyState(i18n.t('pending.title'), i18n.t('pending.description', { module: title }), [
      Badge(i18n.t('common.pending'), 'warn'),
    ]),
  ]);
}
