import type { AppContext } from '../../app/context';
import { LOCALE_LABELS } from '../../i18n';
import { Badge } from '../components';
import { clear, el } from '../dom';
import { DashboardScreen } from '../screens/dashboard/DashboardScreen';
import { PendingScreen } from '../screens/pending/PendingScreen';
import { SettingsScreen } from '../screens/settings/SettingsScreen';
import { NAV_ITEMS, type ScreenId } from './navigation';

export interface ShellHandle {
  setScreen(id: ScreenId): void;
  getScreen(): ScreenId;
  destroy(): void;
}

function renderScreen(id: ScreenId, context: AppContext): HTMLElement {
  if (id === 'dashboard') return DashboardScreen(context);
  if (id === 'settings') return SettingsScreen(context);
  return PendingScreen(context, id);
}

/**
 * Panel shell: header, navigation and the active screen. Re-renders whenever
 * the locale changes, so switching language never requires a restart.
 */
export function mountShell(root: HTMLElement, context: AppContext): ShellHandle {
  let activeScreen: ScreenId = 'dashboard';

  const render = (): void => {
    clear(root);

    const nav = el(
      'nav',
      { className: 'rfc-nav', attrs: { 'aria-label': context.i18n.t('nav.sections') } },
      [
        el('div', { className: 'rfc-nav__label', text: context.i18n.t('nav.sections') }),
        ...NAV_ITEMS.map((item) => {
          const isActive = item.id === activeScreen;
          const children = [el('span', { text: context.i18n.t(item.labelKey) })];
          if (item.kind === 'module') children.push(el('span', { className: 'rfc-nav__dot' }));

          const button = el(
            'button',
            {
              className: `rfc-nav__item${isActive ? ' rfc-nav__item--active' : ''}`,
              attrs: { type: 'button', 'data-screen': item.id },
              onClick: () => {
                activeScreen = item.id;
                render();
              },
            },
            children,
          );
          if (isActive) button.setAttribute('aria-current', 'page');
          return button;
        }),
      ],
    );

    const app = el('div', { className: 'rfc-app' }, [
      el('header', { className: 'rfc-header' }, [
        el('div', { className: 'rfc-header__identity' }, [
          el('div', { className: 'rfc-header__mark' }, [
            el('span', { className: 'rfc-header__glyph', text: 'R' }),
            el('span', { text: context.i18n.t('app.name') }),
          ]),
          el('div', { className: 'rfc-header__tagline', text: context.i18n.t('app.tagline') }),
        ]),
        Badge(LOCALE_LABELS[context.i18n.locale], 'accent'),
      ]),
      el('div', { className: 'rfc-body' }, [
        nav,
        el('main', { className: 'rfc-main' }, [renderScreen(activeScreen, context)]),
      ]),
    ]);

    root.appendChild(app);
  };

  const unsubscribe = context.i18n.subscribe(() => render());
  render();

  return {
    setScreen(id) {
      if (id === activeScreen) return;
      activeScreen = id;
      render();
    },
    getScreen: () => activeScreen,
    destroy() {
      unsubscribe();
      clear(root);
    },
  };
}
