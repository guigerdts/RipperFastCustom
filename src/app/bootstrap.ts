import { createPhotoshopHostAdapter } from '../adapters/photoshop';
import { createGlobalModuleLoader, type ModuleLoader } from '../adapters/runtime/moduleLoader';
import { createUXPEnvironmentService } from '../adapters/uxp/UXPEnvironmentService';
import type { UxpEnvironment } from '../adapters/types';
import { createI18n, type Locale } from '../i18n';
import {
  createDiagnostics,
  type DiagnosticsService,
} from '../services/diagnostics/DiagnosticsService';
import { createInMemoryStorage, type StorageService } from '../services/storage/StorageService';
import { DEFAULT_APP_CONFIG, validateAppConfig, type AppConfig } from '../validation/config';
import { mountShell, type ShellHandle } from '../ui/shell/Shell';
import type { AppContext } from './context';

export const STORAGE_KEYS = { locale: 'rfc.locale' } as const;

export interface BootstrapOptions {
  /** Injected for tests; defaults to the UXP `require` global. */
  readonly loader?: ModuleLoader;
  readonly storage?: StorageService;
  readonly diagnostics?: DiagnosticsService;
  /** Overrides any stored locale. */
  readonly locale?: Locale;
}

function resolveConfig(
  storage: StorageService,
  override?: Locale,
): { config: AppConfig; issues: readonly string[] } {
  const raw = override ?? storage.get(STORAGE_KEYS.locale);
  if (raw === null || raw === undefined) return { config: DEFAULT_APP_CONFIG, issues: [] };
  return validateAppConfig({ locale: raw });
}

/**
 * Builds the application context: detects the environment once, wires the
 * host adapter through the injectable module loader and records diagnostics.
 */
export function createAppContext(options: BootstrapOptions = {}): AppContext {
  const loader = options.loader ?? createGlobalModuleLoader();
  const storage = options.storage ?? createInMemoryStorage();
  const diagnostics: DiagnosticsService = options.diagnostics ?? createDiagnostics();

  const { config, issues } = resolveConfig(storage, options.locale);
  const i18n = createI18n(config.locale);
  const environment: UxpEnvironment = createUXPEnvironmentService(loader).getEnvironment();
  const host = createPhotoshopHostAdapter(loader);

  diagnostics.record('info', 'bootstrap.start');
  for (const issue of issues) diagnostics.record('warn', 'config.invalid', issue);
  diagnostics.record(
    environment.moduleLoaderAvailable ? 'info' : 'error',
    'environment.moduleLoader',
    environment.moduleLoaderAvailable ? 'available' : 'unavailable',
  );
  diagnostics.record(
    environment.uxpModuleLoaded ? 'info' : 'warn',
    'environment.uxpModule',
    environment.uxpModuleLoaded ? 'loaded' : 'not_loaded',
  );
  diagnostics.record(
    host.available ? 'info' : 'warn',
    'environment.photoshop',
    host.available ? 'loaded' : 'not_loaded',
  );
  diagnostics.record('info', 'bootstrap.ready');

  i18n.subscribe((locale) => storage.set(STORAGE_KEYS.locale, locale));

  return { config, i18n, environment, host, storage, diagnostics };
}

/** Renders the panel into `root` and returns the shell handle. */
export function mountApp(root: HTMLElement, context: AppContext): ShellHandle {
  return mountShell(root, context);
}
