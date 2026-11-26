import type { TranslationKey } from '../../i18n/es';
import type { ModuleId } from '../../modules/types';

export type ScreenId = 'dashboard' | 'settings' | ModuleId;

export type NavKind = 'builtin' | 'module';

export interface NavItem {
  readonly id: ScreenId;
  readonly labelKey: TranslationKey;
  readonly kind: NavKind;
}

/** Ordered navigation: the eight sections required by the product brief. */
export const NAV_ITEMS: readonly NavItem[] = [
  { id: 'dashboard', labelKey: 'nav.dashboard', kind: 'builtin' },
  { id: 'screen-printing', labelKey: 'nav.screenPrinting', kind: 'module' },
  { id: 'dtf-studio', labelKey: 'nav.dtfStudio', kind: 'module' },
  { id: 'halftone-studio', labelKey: 'nav.halftoneStudio', kind: 'module' },
  { id: 'calibration', labelKey: 'nav.calibration', kind: 'module' },
  { id: 'preflight', labelKey: 'nav.preflight', kind: 'module' },
  { id: 'production', labelKey: 'nav.production', kind: 'module' },
  { id: 'settings', labelKey: 'nav.settings', kind: 'builtin' },
];

export function isScreenId(value: string): value is ScreenId {
  return NAV_ITEMS.some((item) => item.id === value);
}
