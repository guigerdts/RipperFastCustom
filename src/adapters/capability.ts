/** Capability contract: what this build can ask the host to do, and what it found. */

export const CAPABILITY_IDS = [
  'photoshop.module',
  'photoshop.app',
  'photoshop.app.activeDocument',
  'photoshop.app.documents',
  'photoshop.app.createDocument',
  'photoshop.core.apiVersion',
  'photoshop.core.executeAsModal',
  'photoshop.imaging',
  'photoshop.imaging.getPixels',
  'photoshop.imaging.putPixels',
  'photoshop.document.id',
  'photoshop.document.name',
  'photoshop.document.width',
  'photoshop.document.height',
  'photoshop.document.resolution',
  'photoshop.document.mode',
  'photoshop.document.bitsPerChannel',
  'photoshop.document.layers',
  'photoshop.document.createLayer',
  'photoshop.layerCollection.length',
] as const;

export type CapabilityId = (typeof CAPABILITY_IDS)[number];

export type CapabilityState = 'available' | 'unavailable' | 'unknown';

export interface CapabilityReport {
  readonly id: CapabilityId;
  readonly state: CapabilityState;
  readonly reason: string | null;
}

/**
 * Every member the real halftone flow needs before it may start: a modal scope
 * to mutate the document, a way to create the output document, and pixel
 * access in both directions.
 *
 * This set is deliberately static and document-independent, because the flow
 * creates its own output document. Document-level members such as
 * `document.createLayer` are checked inside the flow, once a document exists.
 */
export const HALFTONE_FLOW_REQUIREMENTS = [
  'photoshop.core.executeAsModal',
  'photoshop.app.createDocument',
  'photoshop.imaging.getPixels',
  'photoshop.imaging.putPixels',
] as const satisfies readonly CapabilityId[];

export interface PhotoshopCapabilities {
  /**
   * The DOM API version the running host reports for this plugin, or null when
   * the host does not expose it. This is an observed value, not a build
   * constant: the same bundle ships in both staged builds.
   */
  readonly apiVersion: number | null;
  getState(id: CapabilityId): CapabilityState;
  getReason(id: CapabilityId): string | null;
  isAvailable(id: CapabilityId): boolean;
  report(): readonly CapabilityReport[];
  /** True only when every halftone flow requirement is observed as available. */
  isHalftoneFlowReady(): boolean;
  /** The missing requirements, in declaration order. Empty when ready. */
  halftoneFlowBlockers(): readonly CapabilityId[];
}
