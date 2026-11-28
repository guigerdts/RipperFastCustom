import {
  MAX_LEGACY_PHOTOSHOP_VERSION,
  MIN_MODERN_PHOTOSHOP_VERSION,
  MIN_PHOTOSHOP_VERSION,
  STAGED_BUILD_COUNT,
} from '../constants/app';
import { compareVersions, parseVersion } from './version';
import { isRecord, validateManifest, type ManifestIssue } from './manifest';

interface HostRange {
  readonly id: string;
  readonly minVersion: string;
  readonly maxVersion: string | null;
}

function readRange(manifest: unknown, index: number, issues: ManifestIssue[]): HostRange | null {
  if (!isRecord(manifest) || !isRecord(manifest['host'])) {
    issues.push({ path: `[${index}]`, message: 'must be an object with a host definition' });
    return null;
  }
  const id = typeof manifest['id'] === 'string' ? manifest['id'] : '';
  const host = manifest['host'];
  const minVersion = typeof host['minVersion'] === 'string' ? host['minVersion'] : null;
  const maxVersion = typeof host['maxVersion'] === 'string' ? host['maxVersion'] : null;
  if (!id || !minVersion || !parseVersion(minVersion)) {
    issues.push({ path: `[${index}]`, message: 'must declare an id and a parseable minVersion' });
    return null;
  }
  return { id, minVersion, maxVersion };
}

/**
 * Validates the staged build set as one product: each manifest passes its own
 * structural validation, every build shares the same plugin id, and the host
 * ranges are ordered, contiguous and disjoint, so any host version matches
 * exactly one package.
 *
 * The set is exactly the two builds the product ships. A third stage would add
 * a package and a test matrix without adding a capability (see the ADR).
 */
export function validateCompatibilitySet(manifests: readonly unknown[]): readonly ManifestIssue[] {
  const issues: ManifestIssue[] = [];

  for (const [index, manifest] of manifests.entries()) {
    for (const issue of validateManifest(manifest)) {
      issues.push({ path: `[${index}].${issue.path}`, message: issue.message });
    }
  }

  const ranges = manifests
    .map((manifest, index) => readRange(manifest, index, issues))
    .filter((range): range is HostRange => range !== null);

  // Comparing incomplete ranges would report boundary errors that are really
  // parse errors, so the ordered checks wait until every entry is readable.
  if (ranges.length !== manifests.length) return issues;

  if (ranges.length !== STAGED_BUILD_COUNT) {
    issues.push({
      path: 'compatibility.count',
      message: `the staged set must contain exactly ${STAGED_BUILD_COUNT} builds`,
    });
  }

  const ordered = [...ranges].sort((a, b) => compareVersions(a.minVersion, b.minVersion));

  const lowest = ordered[0];
  if (lowest && compareVersions(lowest.minVersion, MIN_PHOTOSHOP_VERSION) !== 0) {
    issues.push({
      path: 'compatibility.lowest',
      message: `the lowest staged build must start at ${MIN_PHOTOSHOP_VERSION}`,
    });
  }

  for (const [index, range] of ordered.entries()) {
    if (range.maxVersion === null) {
      if (index !== ordered.length - 1) {
        issues.push({
          path: `compatibility[${index}].maxVersion`,
          message: 'only the highest staged build may leave the upper bound open',
        });
      }
      continue;
    }
    const next = ordered[index + 1];
    if (!next) {
      issues.push({
        path: `compatibility[${index}].maxVersion`,
        message: 'the highest staged build must leave the upper bound open',
      });
      continue;
    }
    if (compareVersions(range.maxVersion, next.minVersion) >= 0) {
      issues.push({
        path: `compatibility[${index}].maxVersion`,
        message: 'staged host ranges must not overlap',
      });
    }
  }

  const highest = ordered[1];
  if (lowest && lowest.maxVersion !== null) {
    if (
      lowest.maxVersion !== MAX_LEGACY_PHOTOSHOP_VERSION ||
      (highest !== undefined && highest.minVersion !== MIN_MODERN_PHOTOSHOP_VERSION)
    ) {
      issues.push({
        path: 'compatibility.boundary',
        message: `the staged split must be ${MAX_LEGACY_PHOTOSHOP_VERSION} | ${MIN_MODERN_PHOTOSHOP_VERSION}`,
      });
    }
  }

  const ids = new Set(ranges.map((range) => range.id));
  if (ids.size > 1) {
    issues.push({
      path: 'compatibility.id',
      message: 'every staged build must keep the same plugin id',
    });
  }

  return issues;
}
