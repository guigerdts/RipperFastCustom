import type { PhotoshopCapabilities } from './capability';

/** Snapshot of the active Photoshop document, or null when none is readable. */
export interface ActiveDocumentInfo {
  readonly name: string | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly resolution: number | null;
}

export interface DocumentService {
  /** Never throws; returns null when no document can be read safely. */
  getActiveDocumentInfo(): ActiveDocumentInfo | null;
  countOpenDocuments(): number | null;
}

export interface LayerService {
  /** Layer count of the active document, or null when unavailable. */
  countLayers(): number | null;
}

/**
 * The only gateway between UI code and the Photoshop host. Components must
 * never call `require('photoshop')` directly.
 */
export interface PhotoshopHostAdapter {
  readonly available: boolean;
  readonly capabilities: PhotoshopCapabilities;
  readonly documents: DocumentService;
  readonly layers: LayerService;
}

/** Host/UXP facts reported by the `uxp` module. Null means "not readable". */
export interface UxpEnvironment {
  readonly moduleLoaderAvailable: boolean;
  readonly uxpModuleLoaded: boolean;
  readonly hostName: string | null;
  readonly hostVersion: string | null;
  readonly uxpVersion: string | null;
}

export interface UXPEnvironmentService {
  getEnvironment(): UxpEnvironment;
}
