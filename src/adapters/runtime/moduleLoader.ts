/**
 * Loads UXP host modules (`photoshop`, `uxp`) behind an injectable seam so
 * host-independent tests never touch a real Photoshop installation.
 */
export type ModuleLoader = (id: string) => unknown;

/**
 * Resolves the `require` global that the UXP runtime injects into the plugin
 * context. Returns null when the runtime does not expose it (for example in a
 * plain browser or a test harness), which the adapters translate into
 * "host unavailable" instead of a crash.
 */
export function createGlobalModuleLoader(): ModuleLoader {
  return (id: string): unknown => {
    const scope = globalThis as { require?: (moduleId: string) => unknown };
    if (typeof scope.require !== 'function') {
      throw new Error('module_loader_unavailable');
    }
    return scope.require(id);
  };
}

/** Loads a module, converting any loader failure into `null`. */
export function loadModuleOrNull(loader: ModuleLoader, id: string): unknown {
  try {
    return loader(id);
  } catch {
    return null;
  }
}
