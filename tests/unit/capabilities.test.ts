import { describe, expect, it } from 'vitest';
import { CAPABILITY_IDS } from '../../src/adapters/capability';
import { detectCapabilities } from '../../src/adapters/photoshop/capabilities';
import { createFakePhotoshopModule } from '../helpers/fakeHost';

describe('capability detection', () => {
  it('reports every capability when the host module is absent', () => {
    const capabilities = detectCapabilities(null, null);
    expect(capabilities.apiVersion).toBe(1);
    expect(capabilities.getState('photoshop.module')).toBe('unavailable');
    expect(capabilities.getReason('photoshop.module')).toBe('module_not_loaded');

    for (const id of CAPABILITY_IDS) {
      expect(capabilities.getState(id)).toBe('unavailable');
      expect(capabilities.isAvailable(id)).toBe(false);
    }
  });

  it('reports the full API v1 surface when the host and a document are present', () => {
    const moduleValue = createFakePhotoshopModule({ document: {} });
    const app = moduleValue['app'] as Record<string, unknown>;
    const capabilities = detectCapabilities(moduleValue, app['activeDocument']);

    expect(capabilities.isAvailable('photoshop.module')).toBe(true);
    expect(capabilities.isAvailable('photoshop.app')).toBe(true);
    expect(capabilities.isAvailable('photoshop.app.activeDocument')).toBe(true);
    expect(capabilities.isAvailable('photoshop.app.documents')).toBe(true);
    expect(capabilities.isAvailable('photoshop.core.executeAsModal')).toBe(true);
    expect(capabilities.isAvailable('photoshop.document.width')).toBe(true);
    expect(capabilities.isAvailable('photoshop.layerCollection.length')).toBe(true);
  });

  it('marks document capabilities as unknown when no document is open', () => {
    const moduleValue = createFakePhotoshopModule({ document: null });
    const capabilities = detectCapabilities(moduleValue, null);

    expect(capabilities.isAvailable('photoshop.app')).toBe(true);
    expect(capabilities.getState('photoshop.document.width')).toBe('unknown');
    expect(capabilities.getReason('photoshop.document.width')).toBe('no_active_document');
    expect(capabilities.isAvailable('photoshop.document.width')).toBe(false);
  });

  it('marks missing members as unavailable with a reason', () => {
    const moduleValue = createFakePhotoshopModule({
      withExecuteAsModal: false,
      withDocuments: false,
      document: { omit: ['resolution'] },
    });
    const doc = (moduleValue['app'] as Record<string, unknown>)['activeDocument'];
    const capabilities = detectCapabilities(moduleValue, doc);

    expect(capabilities.getState('photoshop.core.executeAsModal')).toBe('unavailable');
    expect(capabilities.getReason('photoshop.core.executeAsModal')).toBe('member_missing');
    expect(capabilities.getState('photoshop.app.documents')).toBe('unavailable');
    expect(capabilities.getState('photoshop.document.resolution')).toBe('unavailable');
    expect(capabilities.isAvailable('photoshop.document.width')).toBe(true);
  });

  it('does not crash when reading activeDocument throws', () => {
    const moduleValue = createFakePhotoshopModule({ throwOnActiveDocument: true });
    const capabilities = detectCapabilities(moduleValue, null);
    expect(capabilities.isAvailable('photoshop.app')).toBe(true);
    expect(capabilities.getState('photoshop.document.width')).toBe('unknown');
  });

  it('returns a stable report for every declared capability', () => {
    const capabilities = detectCapabilities(createFakePhotoshopModule({ document: {} }), {});
    const report = capabilities.report();
    expect(report.map((entry) => entry.id)).toEqual([...CAPABILITY_IDS]);
    for (const entry of report) {
      expect(['available', 'unavailable', 'unknown']).toContain(entry.state);
    }
  });
});
