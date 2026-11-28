import {
  LEGACY_API_VERSION,
  MIN_MODAL_PHOTOSHOP_VERSION,
  MIN_PHOTOSHOP_VERSION,
  MODERN_API_VERSION,
} from '../constants/app';
import { compareVersions, parseVersion } from './version';

export interface ManifestIssue {
  readonly path: string;
  readonly message: string;
}

const FORBIDDEN_PERMISSION_KEYS = ['network', 'launchProcess', 'webview', 'clipboard'] as const;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(
  value: Record<string, unknown>,
  key: string,
  issues: ManifestIssue[],
): string | null {
  const raw = value[key];
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    issues.push({ path: key, message: 'must be a non-empty string' });
    return null;
  }
  return raw;
}

function readHostVersion(
  host: Record<string, unknown>,
  key: string,
  issues: ManifestIssue[],
): string | null {
  const raw = host[key];
  if (raw === undefined) return null;
  if (typeof raw !== 'string' || !parseVersion(raw)) {
    issues.push({ path: `host.${key}`, message: 'must be a dotted numeric version' });
    return null;
  }
  return raw;
}

/**
 * Structural validation of one UXP manifest against the contract this build
 * depends on: manifest v4, Photoshop host, a declared API version the platform
 * can actually deliver, a coherent host range, a panel entrypoint and no
 * unnecessary permissions.
 *
 * Two API versions are accepted because the product ships two staged builds
 * (see `docs/compatibility-uxp.md`). `apiVersion: 2` requires a host range that
 * starts at the first release with a modal scope: declaring v2 below it is the
 * undefined combination the platform does not document.
 */
export function validateManifest(value: unknown): readonly ManifestIssue[] {
  const issues: ManifestIssue[] = [];
  if (!isRecord(value)) {
    return [{ path: '', message: 'manifest must be a JSON object' }];
  }

  requireString(value, 'id', issues);
  requireString(value, 'name', issues);

  const version = requireString(value, 'version', issues);
  if (version && !parseVersion(version)) {
    issues.push({ path: 'version', message: 'must be a dotted numeric version' });
  }

  const main = requireString(value, 'main', issues);
  if (main && !main.endsWith('.html')) {
    issues.push({ path: 'main', message: 'must point to an HTML entrypoint' });
  }

  if (value['manifestVersion'] !== 4) {
    issues.push({ path: 'manifestVersion', message: 'must be 4 for this build' });
  }

  const host = value['host'];
  if (!isRecord(host)) {
    issues.push({ path: 'host', message: 'must be an object' });
  } else {
    if (host['app'] !== 'PS') {
      issues.push({ path: 'host.app', message: 'must be "PS"' });
    }

    const minVersion = readHostVersion(host, 'minVersion', issues);
    const maxVersion = readHostVersion(host, 'maxVersion', issues);

    if (minVersion && parseVersion(minVersion)) {
      if (compareVersions(minVersion, MIN_PHOTOSHOP_VERSION) < 0) {
        issues.push({
          path: 'host.minVersion',
          message: `must be ${MIN_PHOTOSHOP_VERSION} or later`,
        });
      }
    }
    if (minVersion && maxVersion && parseVersion(minVersion) && parseVersion(maxVersion)) {
      if (compareVersions(maxVersion, minVersion) < 0) {
        issues.push({
          path: 'host.maxVersion',
          message: 'must not be lower than host.minVersion',
        });
      }
    }

    const data = host['data'];
    if (!isRecord(data)) {
      issues.push({ path: 'host.data', message: 'must declare the Photoshop API version' });
    } else {
      // UXP makes `apiVersion` optional and infers a default from `minVersion`
      // (< 23.0 → v1, ≥ 23.0 → v2). This build does not accept that inference:
      // the shipped stage must say which DOM it targets, so the manifest can
      // never silently inherit the wrong one from its own floor.
      const apiVersion = data['apiVersion'];
      if (apiVersion !== LEGACY_API_VERSION && apiVersion !== MODERN_API_VERSION) {
        issues.push({
          path: 'host.data.apiVersion',
          message: `must be ${LEGACY_API_VERSION} or ${MODERN_API_VERSION}`,
        });
      } else if (apiVersion === MODERN_API_VERSION && minVersion) {
        if (compareVersions(minVersion, MIN_MODAL_PHOTOSHOP_VERSION) < 0) {
          issues.push({
            path: 'host.data.apiVersion',
            message: `apiVersion ${MODERN_API_VERSION} requires host.minVersion ${MIN_MODAL_PHOTOSHOP_VERSION} or later`,
          });
        }
      }
    }
  }

  const entrypoints = value['entrypoints'];
  if (!Array.isArray(entrypoints) || entrypoints.length === 0) {
    issues.push({ path: 'entrypoints', message: 'must declare at least one entrypoint' });
  } else {
    const panel = entrypoints.find((item) => isRecord(item) && item['type'] === 'panel');
    if (!panel || !isRecord(panel)) {
      issues.push({ path: 'entrypoints', message: 'must include a panel entrypoint' });
    } else {
      requireString(panel, 'id', issues);
      const label = panel['label'];
      if (!isRecord(label) || typeof label['default'] !== 'string') {
        issues.push({ path: 'entrypoints.label', message: 'must provide a default label' });
      }
      for (const sizeKey of ['minimumSize', 'preferredFloatingSize'] as const) {
        const size = panel[sizeKey];
        if (size !== undefined && !isRecord(size)) {
          issues.push({ path: `entrypoints.${sizeKey}`, message: 'must be an object' });
        }
      }
    }
  }

  const permissions = value['requiredPermissions'];
  if (permissions !== undefined) {
    if (!isRecord(permissions)) {
      issues.push({ path: 'requiredPermissions', message: 'must be an object' });
    } else {
      for (const key of FORBIDDEN_PERMISSION_KEYS) {
        if (permissions[key] !== undefined) {
          issues.push({
            path: `requiredPermissions.${key}`,
            message: 'is not required by this build',
          });
        }
      }
      if (permissions['localFileSystem'] !== undefined) {
        issues.push({
          path: 'requiredPermissions.localFileSystem',
          message: 'is not required by this build',
        });
      }
    }
  }

  return issues;
}
