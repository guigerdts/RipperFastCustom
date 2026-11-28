import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateManifest } from '../../src/validation/manifest';
import { MIN_MODAL_PHOTOSHOP_VERSION } from '../../src/constants/app';

const read = (file: string): Record<string, unknown> =>
  JSON.parse(readFileSync(path.resolve(process.cwd(), file), 'utf8')) as Record<string, unknown>;

const modern = read('manifest.json');
const legacy = read('manifest-legacy.json');

const clone = (source: Record<string, unknown>): Record<string, unknown> =>
  JSON.parse(JSON.stringify(source)) as Record<string, unknown>;

describe('shipped manifests', () => {
  it('both pass structural validation with no issues', () => {
    expect(validateManifest(modern)).toEqual([]);
    expect(validateManifest(legacy)).toEqual([]);
  });

  it('declare manifest version 4', () => {
    expect(modern['manifestVersion']).toBe(4);
    expect(legacy['manifestVersion']).toBe(4);
  });

  it('use two-segment host versions, the format marketplace upload requires', () => {
    for (const manifest of [modern, legacy]) {
      const host = manifest['host'] as Record<string, unknown>;
      for (const key of ['minVersion', 'maxVersion']) {
        const value = host[key];
        if (value === undefined) continue;
        expect(typeof value).toBe('string');
        expect((value as string).split('.')).toHaveLength(2);
      }
    }
  });

  it('request no permissions in either build', () => {
    expect(modern['requiredPermissions']).toEqual({});
    expect(legacy['requiredPermissions']).toEqual({});
  });
});

describe('validateManifest negative cases', () => {
  it('rejects an apiVersion outside the supported set', () => {
    const broken = clone(modern);
    ((broken['host'] as Record<string, unknown>)['data'] as Record<string, unknown>)['apiVersion'] =
      3;
    expect(validateManifest(broken).some((issue) => issue.path === 'host.data.apiVersion')).toBe(
      true,
    );
  });

  it('rejects apiVersion 2 on a host range that predates the modal scope', () => {
    const broken = clone(modern);
    (broken['host'] as Record<string, unknown>)['minVersion'] = '22.0';
    expect(validateManifest(broken).some((issue) => issue.path === 'host.data.apiVersion')).toBe(
      true,
    );
  });

  it('accepts apiVersion 2 exactly at the first modal release', () => {
    const atFloor = clone(modern);
    (atFloor['host'] as Record<string, unknown>)['minVersion'] = MIN_MODAL_PHOTOSHOP_VERSION;
    expect(validateManifest(atFloor)).toEqual([]);
  });

  it('rejects a manifest that omits apiVersion and would inherit a default', () => {
    const broken = clone(legacy);
    const data = (broken['host'] as Record<string, unknown>)['data'] as Record<string, unknown>;
    delete data['apiVersion'];
    expect(validateManifest(broken).some((issue) => issue.path === 'host.data.apiVersion')).toBe(
      true,
    );
  });

  it('rejects a host floor below Photoshop 2021', () => {
    const broken = clone(legacy);
    (broken['host'] as Record<string, unknown>)['minVersion'] = '21.0';
    expect(validateManifest(broken).some((issue) => issue.path === 'host.minVersion')).toBe(true);
  });

  it('rejects a maxVersion lower than minVersion', () => {
    const broken = clone(legacy);
    (broken['host'] as Record<string, unknown>)['maxVersion'] = '21.5';
    expect(validateManifest(broken).some((issue) => issue.path === 'host.maxVersion')).toBe(true);
  });

  it('rejects a manifest version other than 4', () => {
    const broken = clone(modern);
    broken['manifestVersion'] = 5;
    expect(validateManifest(broken).some((issue) => issue.path === 'manifestVersion')).toBe(true);
  });

  it('rejects a non-Photoshop host', () => {
    const broken = clone(modern);
    (broken['host'] as Record<string, unknown>)['app'] = 'AI';
    expect(validateManifest(broken).some((issue) => issue.path === 'host.app')).toBe(true);
  });

  it('rejects unnecessary permissions', () => {
    const broken = clone(modern);
    broken['requiredPermissions'] = { network: { domains: ['https://example.com'] } };
    expect(
      validateManifest(broken).some((issue) => issue.path === 'requiredPermissions.network'),
    ).toBe(true);
  });

  it('rejects a missing panel entrypoint', () => {
    const broken = clone(modern);
    broken['entrypoints'] = [];
    expect(validateManifest(broken).some((issue) => issue.path === 'entrypoints')).toBe(true);
  });

  it('rejects a non-object manifest', () => {
    expect(validateManifest('nope')).toHaveLength(1);
  });
});
