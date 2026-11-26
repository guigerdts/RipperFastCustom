import type { PhotoshopHostAdapter, UxpEnvironment } from '../adapters/types';
import type { I18nService } from '../i18n';
import type { DiagnosticsService } from '../services/diagnostics/DiagnosticsService';
import type { StorageService } from '../services/storage/StorageService';
import type { AppConfig } from '../validation/config';

/**
 * Everything a screen is allowed to read. Screens receive the context; they
 * never construct adapters or load host modules themselves.
 */
export interface AppContext {
  readonly config: AppConfig;
  readonly i18n: I18nService;
  readonly environment: UxpEnvironment;
  readonly host: PhotoshopHostAdapter;
  readonly storage: StorageService;
  readonly diagnostics: DiagnosticsService;
}
