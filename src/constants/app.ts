/** Product identity and compatibility constants. */

export const APP_NAME = 'RipperFastCustom';
export const APP_VERSION = '0.1.0';
export const APP_MANIFEST_ID = 'com.ripperfastcustom.panel';

/**
 * Host ranges of the two staged builds. See `docs/compatibility-uxp.md`.
 *
 * The legacy build keeps the plugin loadable from Photoshop 2021 and stops
 * before the release where the `imaging` module name appears. The modern build
 * starts exactly there, so the two ranges never overlap and a host version
 * matches exactly one package.
 */
export const MIN_PHOTOSHOP_VERSION = '22.0';
export const MAX_LEGACY_PHOTOSHOP_VERSION = '24.3';
export const MIN_MODERN_PHOTOSHOP_VERSION = '24.4';

/** The staged set is exactly this pair; a third stage adds no capability. */
export const STAGED_BUILD_COUNT = 2;

/**
 * First Photoshop release where the modal scope exists at all: `22.5`, the
 * release that introduced `apiVersion: 2` and `core.executeAsModal`.
 */
export const MIN_MODAL_PHOTOSHOP_VERSION = '22.5';

/** Photoshop DOM API versions a staged build may declare. */
export const LEGACY_API_VERSION = 1;
export const MODERN_API_VERSION = 2;
export const SUPPORTED_API_VERSIONS = [LEGACY_API_VERSION, MODERN_API_VERSION] as const;
export type DeclaredApiVersion = (typeof SUPPORTED_API_VERSIONS)[number];

/** First Photoshop release that exposes the `imaging` module name. */
export const MIN_IMAGING_PHOTOSHOP_VERSION = '24.4';

/** UXP manifest version this build targets. */
export const DECLARED_MANIFEST_VERSION = 4 as const;
