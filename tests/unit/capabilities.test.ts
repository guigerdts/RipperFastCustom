import { describe, expect, it } from 'vitest';
import { CAPABILITY_IDS, HALFTONE_FLOW_REQUIREMENTS } from '../../src/adapters/capability';
import { detectCapabilities } from '../../src/adapters/photoshop/capabilities';
import { createFakePhotoshopModule } from '../helpers/fakeHost';

const withDocument = (moduleValue: Record<string, unknown>): unknown =>
  (moduleValue['app'] as Record<string, unknown>)['activeDocument'];

/** A Photoshop 22.0 host: an app and a document, no modal scope, no imaging. */
function legacyHost(): Record<string, unknown> {
  return createFakePhotoshopModule({
    document: {},
    withCore: false,
    imaging: { withImaging: false },
  });
}

/** A Photoshop 24.4 host: modal scope, imaging, and everything the flow needs. */
function modernHost(): Record<string, unknown> {
  return createFakePhotoshopModule({ document: {}, apiVersion: 2 });
}

describe('capability detection without a host module', () => {
  it('reports every capability as unavailable and observes no API version', () => {
    const capabilities = detectCapabilities(null, null);
    expect(capabilities.apiVersion).toBeNull();
    expect(capabilities.getState('photoshop.module')).toBe('unavailable');
    expect(capabilities.getReason('photoshop.module')).toBe('module_not_loaded');

    for (const id of CAPABILITY_IDS) {
      expect(capabilities.getState(id)).toBe('unavailable');
      expect(capabilities.isAvailable(id)).toBe(false);
    }
  });

  it('refuses the halftone flow and names every requirement as a blocker', () => {
    const capabilities = detectCapabilities(null, null);
    expect(capabilities.isHalftoneFlowReady()).toBe(false);
    expect(capabilities.halftoneFlowBlockers()).toEqual(HALFTONE_FLOW_REQUIREMENTS);
  });
});

describe('capability detection on a legacy host', () => {
  it('reports the read surface but no modal scope', () => {
    const moduleValue = legacyHost();
    const capabilities = detectCapabilities(moduleValue, withDocument(moduleValue));

    expect(capabilities.isAvailable('photoshop.module')).toBe(true);
    expect(capabilities.isAvailable('photoshop.app')).toBe(true);
    expect(capabilities.isAvailable('photoshop.app.activeDocument')).toBe(true);
    expect(capabilities.getState('photoshop.core.executeAsModal')).toBe('unavailable');
    expect(capabilities.getReason('photoshop.core.executeAsModal')).toBe('core_missing');
    expect(capabilities.getState('photoshop.core.apiVersion')).toBe('unavailable');
    expect(capabilities.apiVersion).toBeNull();
  });

  it('reports the Imaging API as missing rather than absent-by-assumption', () => {
    const moduleValue = legacyHost();
    const capabilities = detectCapabilities(moduleValue, withDocument(moduleValue));

    expect(capabilities.getState('photoshop.imaging')).toBe('unavailable');
    expect(capabilities.getReason('photoshop.imaging')).toBe('imaging_missing');
    expect(capabilities.getState('photoshop.imaging.getPixels')).toBe('unavailable');
    expect(capabilities.getReason('photoshop.imaging.getPixels')).toBe('imaging_missing');
  });

  it('keeps the halftone flow closed and names exactly the missing members', () => {
    const moduleValue = legacyHost();
    const capabilities = detectCapabilities(moduleValue, withDocument(moduleValue));

    expect(capabilities.isHalftoneFlowReady()).toBe(false);
    expect(capabilities.halftoneFlowBlockers()).toEqual([
      'photoshop.core.executeAsModal',
      'photoshop.imaging.getPixels',
      'photoshop.imaging.putPixels',
    ]);
  });
});

describe('capability detection on a modern host', () => {
  it('reports the modal scope and the observed API version', () => {
    const moduleValue = modernHost();
    const capabilities = detectCapabilities(moduleValue, withDocument(moduleValue));

    expect(capabilities.apiVersion).toBe(2);
    expect(capabilities.isAvailable('photoshop.core.apiVersion')).toBe(true);
    expect(capabilities.isAvailable('photoshop.core.executeAsModal')).toBe(true);
    expect(capabilities.isAvailable('photoshop.app.createDocument')).toBe(true);
  });

  it('opens the halftone flow only when every requirement is present', () => {
    const moduleValue = modernHost();
    const capabilities = detectCapabilities(moduleValue, withDocument(moduleValue));

    expect(capabilities.isHalftoneFlowReady()).toBe(true);
    expect(capabilities.halftoneFlowBlockers()).toEqual([]);
  });

  it('reports a partial Imaging API as partial, not as ready', () => {
    const moduleValue = createFakePhotoshopModule({
      document: {},
      apiVersion: 2,
      imaging: { withPutPixels: false },
    });
    const capabilities = detectCapabilities(moduleValue, withDocument(moduleValue));

    expect(capabilities.isAvailable('photoshop.imaging')).toBe(true);
    expect(capabilities.isAvailable('photoshop.imaging.getPixels')).toBe(true);
    expect(capabilities.getState('photoshop.imaging.putPixels')).toBe('unavailable');
    expect(capabilities.getReason('photoshop.imaging.putPixels')).toBe('member_missing');
    expect(capabilities.halftoneFlowBlockers()).toEqual(['photoshop.imaging.putPixels']);
  });
});

describe('capability detection on the document surface', () => {
  it('reports document capabilities as unknown when no document is open', () => {
    const moduleValue = createFakePhotoshopModule({ document: null });
    const capabilities = detectCapabilities(moduleValue, null);

    expect(capabilities.isAvailable('photoshop.app')).toBe(true);
    expect(capabilities.getState('photoshop.document.width')).toBe('unknown');
    expect(capabilities.getReason('photoshop.document.width')).toBe('no_active_document');
    expect(capabilities.isAvailable('photoshop.document.width')).toBe(false);
  });

  it('marks missing members as unavailable with a reason', () => {
    const moduleValue = createFakePhotoshopModule({
      withDocuments: false,
      document: { omit: ['resolution', 'createLayer'] },
    });
    const capabilities = detectCapabilities(moduleValue, withDocument(moduleValue));

    expect(capabilities.getState('photoshop.app.documents')).toBe('unavailable');
    expect(capabilities.getState('photoshop.document.resolution')).toBe('unavailable');
    expect(capabilities.getState('photoshop.document.createLayer')).toBe('unavailable');
    expect(capabilities.isAvailable('photoshop.document.width')).toBe(true);
  });

  it('reads the document mode and bit depth the flow validates against', () => {
    const moduleValue = createFakePhotoshopModule({
      document: { mode: 'CMYK', bitsPerChannel: 16 },
    });
    const capabilities = detectCapabilities(moduleValue, withDocument(moduleValue));

    expect(capabilities.isAvailable('photoshop.document.mode')).toBe(true);
    expect(capabilities.isAvailable('photoshop.document.bitsPerChannel')).toBe(true);
  });

  it('does not crash when reading activeDocument throws', () => {
    const moduleValue = createFakePhotoshopModule({ throwOnActiveDocument: true });
    const capabilities = detectCapabilities(moduleValue, null);

    expect(capabilities.isAvailable('photoshop.app')).toBe(true);
    expect(capabilities.getState('photoshop.document.width')).toBe('unknown');
  });
});

describe('capability report', () => {
  it('returns a stable entry for every declared capability', () => {
    const capabilities = detectCapabilities(modernHost(), null);
    const report = capabilities.report();

    expect(report.map((item) => item.id)).toEqual([...CAPABILITY_IDS]);
    for (const item of report) {
      expect(['available', 'unavailable', 'unknown']).toContain(item.state);
    }
  });

  it('never reports a capability the host did not expose', () => {
    const capabilities = detectCapabilities(legacyHost(), null);
    for (const id of ['photoshop.imaging', 'photoshop.imaging.getPixels'] as const) {
      expect(capabilities.getState(id)).toBe('unavailable');
      expect(capabilities.getReason(id)).not.toBeNull();
    }
  });
});
