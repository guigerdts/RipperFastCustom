import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateCompatibilitySet } from '../../src/validation/compatibility';
import {
  LEGACY_API_VERSION,
  MAX_LEGACY_PHOTOSHOP_VERSION,
  MIN_MODAL_PHOTOSHOP_VERSION,
  MIN_MODERN_PHOTOSHOP_VERSION,
  MIN_PHOTOSHOP_VERSION,
  MODERN_API_VERSION,
} from '../../src/constants/app';

const read = (file: string): Record<string, unknown> =>
  JSON.parse(readFileSync(path.resolve(process.cwd(), file), 'utf8')) as Record<string, unknown>;

const modern = read('manifest.json');
const legacy = read('manifest-legacy.json');

const clone = (source: Record<string, unknown>): Record<string, unknown> =>
  JSON.parse(JSON.stringify(source)) as Record<string, unknown>;

const hostOf = (manifest: Record<string, unknown>): Record<string, unknown> =>
  manifest['host'] as Record<string, unknown>;

const dataOf = (manifest: Record<string, unknown>): Record<string, unknown> =>
  hostOf(manifest)['data'] as Record<string, unknown>;

describe('the shipped staged set', () => {
  it('validates as one coherent product', () => {
    expect(validateCompatibilitySet([modern, legacy])).toEqual([]);
  });

  it('stages the host ranges adjacently, with no gap and no overlap', () => {
    expect(hostOf(legacy)['minVersion']).toBe(MIN_PHOTOSHOP_VERSION);
    expect(hostOf(legacy)['maxVersion']).toBe(MAX_LEGACY_PHOTOSHOP_VERSION);
    expect(hostOf(modern)['minVersion']).toBe(MIN_MODERN_PHOTOSHOP_VERSION);
    expect(hostOf(modern)['maxVersion']).toBeUndefined();
  });

  it('pairs each API version with the host range that can deliver it', () => {
    expect(dataOf(legacy)['apiVersion']).toBe(LEGACY_API_VERSION);
    expect(dataOf(modern)['apiVersion']).toBe(MODERN_API_VERSION);
  });

  it('keeps one product identity and the same entrypoints', () => {
    expect(modern['id']).toBe('com.ripperfastcustom.panel');
    expect(legacy['id']).toBe(modern['id']);
    expect(modern['name']).toBe('RipperFastCustom');
    expect(legacy['name']).toBe(modern['name']);
    expect(modern['version']).toBe(legacy['version']);
    expect(modern['main']).toBe('index.html');
    expect(legacy['main']).toBe('index.html');
    expect(modern['entrypoints']).toEqual(legacy['entrypoints']);
  });
});

describe('validateCompatibilitySet negative cases', () => {
  it('rejects overlapping host ranges', () => {
    const overlapping = clone(legacy);
    hostOf(overlapping)['maxVersion'] = '24.4';
    expect(
      validateCompatibilitySet([modern, overlapping]).some(
        (issue) => issue.path === 'compatibility[0].maxVersion',
      ),
    ).toBe(true);
  });

  it('rejects a gap between the staged ranges', () => {
    const gapped = clone(modern);
    hostOf(gapped)['minVersion'] = '24.5';
    expect(
      validateCompatibilitySet([gapped, legacy]).some(
        (issue) => issue.path === 'compatibility.boundary',
      ),
    ).toBe(true);
  });

  it('rejects a split point other than the documented one', () => {
    const shifted = clone(legacy);
    hostOf(shifted)['maxVersion'] = '24.0';
    expect(
      validateCompatibilitySet([modern, shifted]).some(
        (issue) => issue.path === 'compatibility.boundary',
      ),
    ).toBe(true);
  });

  it('rejects two different plugin ids', () => {
    const other = clone(modern);
    other['id'] = 'com.ripperfastcustom.other';
    expect(
      validateCompatibilitySet([other, legacy]).some((issue) => issue.path === 'compatibility.id'),
    ).toBe(true);
  });

  it('rejects an open upper bound on the lower build', () => {
    const unbounded = clone(legacy);
    delete hostOf(unbounded)['maxVersion'];
    expect(
      validateCompatibilitySet([modern, unbounded]).some((issue) =>
        issue.path.startsWith('compatibility['),
      ),
    ).toBe(true);
  });

  it('rejects a third staged build', () => {
    const extra = clone(modern);
    hostOf(extra)['minVersion'] = '25.0';
    expect(
      validateCompatibilitySet([modern, legacy, extra]).some(
        (issue) => issue.path === 'compatibility.count',
      ),
    ).toBe(true);
  });

  it('rejects a single build presented as the whole staged set', () => {
    expect(
      validateCompatibilitySet([modern]).some((issue) => issue.path === 'compatibility.count'),
    ).toBe(true);
  });

  it('reports structural issues from every member of the set', () => {
    const broken = clone(legacy);
    broken['manifestVersion'] = 3;
    expect(
      validateCompatibilitySet([modern, broken]).some((issue) =>
        issue.path.endsWith('manifestVersion'),
      ),
    ).toBe(true);
  });
});

describe('compatibility constants', () => {
  it('place the modal floor at the release that introduced it', () => {
    expect(MIN_MODAL_PHOTOSHOP_VERSION).toBe('22.5');
    expect(MIN_MODAL_PHOTOSHOP_VERSION).not.toBe(MIN_MODERN_PHOTOSHOP_VERSION);
  });

  it('keep the staged ranges adjacent without a gap or an overlap', () => {
    expect(MIN_PHOTOSHOP_VERSION).toBe('22.0');
    expect(MAX_LEGACY_PHOTOSHOP_VERSION).toBe('24.3');
    expect(MIN_MODERN_PHOTOSHOP_VERSION).toBe('24.4');
  });
});
