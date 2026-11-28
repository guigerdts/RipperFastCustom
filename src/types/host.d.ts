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

  /**
   * A folder entry. Only the members the profile store uses are declared;
   * everything is feature-detected before it is called.
   */
  export interface UxpFileEntry {
    readonly name: string;
    readonly isFile?: boolean;
    read?: () => Promise<string>;
    write?: (contents: string) => Promise<void>;
    delete?: () => Promise<void>;
  }

  export interface UxpFolder {
    getEntry?: (name: string) => Promise<UxpFileEntry>;
    getEntries?: () => Promise<UxpFileEntry[]>;
    createFile?: (
      name: string,
      options?: { readonly overwrite?: boolean },
    ) => Promise<UxpFileEntry>;
  }

  /**
   * Plugin-private durable storage. `getDataFolder()` needs the `localFileSystem`
   * manifest permission (`"request"`), which this build does not declare yet, so
   * the profile store reports itself unavailable instead of assuming it exists.
   */
  export interface UxpLocalFileSystem {
    readonly getDataFolder?: () => Promise<UxpFolder>;
  }

  export interface UxpStorage {
    readonly localFileSystem?: UxpLocalFileSystem;
  }

  export const host: UxpHostInfo;
  export const versions: UxpVersions;
  export const storage: UxpStorage;
}
