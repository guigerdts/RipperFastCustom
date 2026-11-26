import type { ModuleLoader } from '../runtime/moduleLoader';
import type { UXPEnvironmentService, UxpEnvironment } from '../types';

const UXP_MODULE_ID = 'uxp';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readMember(owner: unknown, key: string): unknown {
  return isRecord(owner) ? owner[key] : undefined;
}

function readString(owner: unknown, key: string): string | null {
  const value = readMember(owner, key);
  return typeof value === 'string' && value.length > 0 ? value : null;
}

interface ProbeResult {
  readonly loaderAvailable: boolean;
  readonly module: unknown;
}

/**
 * Distinguishes "the runtime has no `require`" (loader unavailable) from
 * "`uxp` module missing" (loader works, module absent).
 */
function probe(loader: ModuleLoader): ProbeResult {
  try {
    return { loaderAvailable: true, module: loader(UXP_MODULE_ID) };
  } catch (error) {
    const unavailable = error instanceof Error && error.message === 'module_loader_unavailable';
    return { loaderAvailable: !unavailable, module: null };
  }
}

/**
 * Reads host and UXP runtime versions from the `uxp` module:
 *   require('uxp').host.version     → Photoshop version, e.g. "22.0.0"
 *   require('uxp').versions.uxp     → UXP version, e.g. "uxp-5.0.0"
 * The UXP version string is reported verbatim.
 */
export function createUXPEnvironmentService(loader: ModuleLoader): UXPEnvironmentService {
  return {
    getEnvironment(): UxpEnvironment {
      const { loaderAvailable, module } = probe(loader);
      const host = readMember(module, 'host');
      const versions = readMember(module, 'versions');

      return {
        moduleLoaderAvailable: loaderAvailable,
        uxpModuleLoaded: isRecord(module),
        hostName: readString(host, 'name'),
        hostVersion: readString(host, 'version'),
        uxpVersion: readString(versions, 'uxp'),
      };
    },
  };
}
