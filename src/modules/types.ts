import type { TranslationKey } from '../i18n/es';

export type ModuleId =
  'screen-printing' | 'dtf-studio' | 'halftone-studio' | 'calibration' | 'preflight' | 'production';

export type ModuleStatus = 'pending' | 'available';

/**
 * Structural contract every feature module must satisfy before it can be
 * flipped to `available`. Modules are registered here; the shell renders
 * anything with `status: 'pending'` as an explicit pending placeholder.
 */
export interface ModuleContract {
  readonly id: ModuleId;
  readonly status: ModuleStatus;
  readonly labelKey: TranslationKey;
}
