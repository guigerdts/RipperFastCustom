/**
 * Minimal ambient typings for the UXP host modules used by this build.
 *
 * Rationale: no official `@types` package exists for `photoshop` / `uxp`, and
 * third-party typings describe the current (API v2) surface. This build targets
 * Photoshop API v1 explicitly, so only the exact members we call are declared.
 * Anything else must be feature-detected at runtime before use.
 */

declare module 'photoshop' {
  export interface PhotoshopLayerCollection {
    readonly length: number;
  }

  export interface PhotoshopDocument {
    readonly name: string;
    readonly width: number;
    readonly height: number;
    readonly resolution: number;
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
    executeAsModal?: <T>(
      callback: (executionContext: unknown, descriptor?: unknown) => Promise<T> | T,
      options?: unknown,
    ) => Promise<T>;
  }

  export const app: PhotoshopApp;
  export const core: PhotoshopCore;
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
