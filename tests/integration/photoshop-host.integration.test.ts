import { describe, expect, it } from 'vitest';
import { createAppContext } from '../../src/app/bootstrap';
import { createGlobalModuleLoader } from '../../src/adapters/runtime/moduleLoader';

/**
 * PENDING INTEGRATION TESTS — not executed.
 *
 * These require a real Adobe Photoshop 22.0+ host with the plugin loaded
 * through UXP Developer Tool, which cannot run on this Linux environment.
 * They are declared skipped so the suite stays green while making the gap
 * explicit instead of pretending the host was verified.
 */
describe.skip('Photoshop host integration (requires Photoshop + UXP Developer Tool)', () => {
  it('loads the real uxp module and reports a host version', () => {
    const context = createAppContext({ loader: createGlobalModuleLoader() });
    expect(context.environment.uxpModuleLoaded).toBe(true);
    expect(context.environment.hostName).toBe('photoshop');
    expect(context.environment.hostVersion).toMatch(/^\d+\.\d+/);
  });

  it('loads the real photoshop module', () => {
    const context = createAppContext({ loader: createGlobalModuleLoader() });
    expect(context.host.available).toBe(true);
    expect(context.host.capabilities.getState('photoshop.app')).toBe('available');
  });

  it('reads the active document when one is open', () => {
    const context = createAppContext({ loader: createGlobalModuleLoader() });
    const document = context.host.documents.getActiveDocumentInfo();
    if (document === null) {
      expect(context.host.documents.countOpenDocuments()).toBe(0);
      return;
    }
    expect(typeof document.width === 'number' || document.width === null).toBe(true);
    expect(context.host.layers.countLayers()).not.toBeNull();
  });

  it('reports executeAsModal availability for API v1 hosts', () => {
    const context = createAppContext({ loader: createGlobalModuleLoader() });
    const state = context.host.capabilities.getState('photoshop.core.executeAsModal');
    expect(['available', 'unavailable']).toContain(state);
  });
});
