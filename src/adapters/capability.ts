/** Capability contract: what this build can ask the host to do, and what it found. */

export const CAPABILITY_IDS = [
  'photoshop.module',
  'photoshop.app',
  'photoshop.app.activeDocument',
  'photoshop.app.documents',
  'photoshop.core.executeAsModal',
  'photoshop.document.name',
  'photoshop.document.width',
  'photoshop.document.height',
  'photoshop.document.resolution',
  'photoshop.document.layers',
  'photoshop.layerCollection.length',
] as const;

export type CapabilityId = (typeof CAPABILITY_IDS)[number];

export type CapabilityState = 'available' | 'unavailable' | 'unknown';

export interface CapabilityReport {
  readonly id: CapabilityId;
  readonly state: CapabilityState;
  readonly reason: string | null;
}

export interface PhotoshopCapabilities {
  /** The Photoshop DOM API version this build declares in its manifest. */
  readonly apiVersion: 1;
  getState(id: CapabilityId): CapabilityState;
  getReason(id: CapabilityId): string | null;
  isAvailable(id: CapabilityId): boolean;
  report(): readonly CapabilityReport[];
}
