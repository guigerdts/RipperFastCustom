/**
 * Minimal ambient typings for the UXP host modules used by this build.
 *
 * Rationale: no official `@types` package exists for `photoshop` / `uxp`, and
 * third-party typings describe only the current (API v2) surface. This build
 * ships two staged manifests from one bundle (see `docs/compatibility-uxp.md`),
 * so the host surface differs by stage. Only the members the adapter layer may
 * touch are declared here; everything else must be feature-detected at runtime
 * before use.
 */

declare module 'photoshop' {
  export interface PhotoshopLayerCollection {
    readonly length: number;
  }

  export interface PhotoshopDocument {
    readonly id: number;
    readonly name: string;
    readonly width: number;
    readonly height: number;
    readonly resolution: number;
    readonly mode?: string;
    readonly bitsPerChannel?: number;
    readonly layers: PhotoshopLayerCollection;
  }

  export interface PhotoshopDocuments {
    readonly length: number;
  }

  export interface PhotoshopApp {
    readonly activeDocument?: PhotoshopDocument;
    readonly documents?: PhotoshopDocuments;
    readonly version?: string;
  }

  export interface PhotoshopCore {
    /**
     * The API version the running host bound this plugin to, read from the
     * manifest. Present from 22.5; absent on earlier hosts.
     */
    readonly apiVersion?: number;
    /**
     * Only available to a plugin declaring `apiVersion: 2` or higher, from
     * Photoshop 22.5. Presence is detected before every use.
     */
    executeAsModal?: <T>(
      callback: (executionContext: unknown, descriptor?: unknown) => Promise<T> | T,
      options?: unknown,
    ) => Promise<T>;
  }

  /**
   * Pixel access. The module name is `imaging` from Photoshop 24.4; earlier
   * hosts either lack it or expose `imaging_beta`. Never assume it exists.
   */
  export interface PhotoshopImaging {
    readonly getPixels?: (options: unknown) => Promise<unknown>;
    readonly putPixels?: (options: unknown) => Promise<void>;
  }

  export const app: PhotoshopApp;
  export const core: PhotoshopCore;
  export const imaging: PhotoshopImaging | undefined;
}

declare module 'uxp' {
  export interface UxpHostInfo {
    readonly name?: string;
    readonly version?: string;
  }

  export interface UxpVersions {
    readonly uxp?: string;
  }

  export const host: UxpHostInfo;
  export const versions: UxpVersions;
}
