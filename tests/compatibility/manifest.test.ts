import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateManifest } from '../../src/validation/manifest';
import { DECLARED_API_VERSION, MIN_PHOTOSHOP_VERSION } from '../../src/constants/app';

const MANIFEST_PATH = path.resolve(process.cwd(), 'manifest.json');
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Record<string, unknown>;

describe('manifest.json', () => {
  it('passes structural validation with no issues', () => {
    expect(validateManifest(manifest)).toEqual([]);
  });

  it('declares manifest version 4', () => {
    expect(manifest['manifestVersion']).toBe(4);
  });

  it('declares the Photoshop host with the 22.0.0 floor', () => {
    const host = manifest['host'] as Record<string, unknown>;
    expect(host['app']).toBe('PS');
    expect(host['minVersion']).toBe(MIN_PHOTOSHOP_VERSION);
  });

  it('declares Photoshop API v1 explicitly', () => {
    const host = manifest['host'] as Record<string, unknown>;
    const data = host['data'] as Record<string, unknown>;
    expect(data['apiVersion']).toBe(DECLARED_API_VERSION);
    expect(data['apiVersion']).not.toBe(2);
  });

  it('exposes exactly one panel entrypoint with a default label', () => {
    const entrypoints = manifest['entrypoints'] as Record<string, unknown>[];
    expect(entrypoints).toHaveLength(1);
    const panel = entrypoints[0] as Record<string, unknown>;
    expect(panel['type']).toBe('panel');
    expect(typeof panel['id']).toBe('string');
    expect((panel['label'] as Record<string, unknown>)['default']).toBe('RipperFastCustom');
  });

  it('requests no permissions', () => {
    expect(manifest['requiredPermissions']).toEqual({});
  });

  it('keeps the product identity stable', () => {
    expect(manifest['id']).toBe('com.ripperfastcustom.panel');
    expect(manifest['name']).toBe('RipperFastCustom');
    expect(manifest['version']).toBe('0.1.0');
    expect(manifest['main']).toBe('index.html');
  });
});

describe('validateManifest negative cases', () => {
  const clone = (): Record<string, unknown> =>
    JSON.parse(JSON.stringify(manifest)) as Record<string, unknown>;

  it('rejects API v2, which would break the Photoshop 22.0 target', () => {
    const broken = clone();
    ((broken['host'] as Record<string, unknown>)['data'] as Record<string, unknown>)['apiVersion'] =
      2;
    expect(validateManifest(broken).some((issue) => issue.path === 'host.data.apiVersion')).toBe(
      true,
    );
  });

  it('rejects a manifest version other than 4', () => {
    const broken = clone();
    broken['manifestVersion'] = 5;
    expect(validateManifest(broken).some((issue) => issue.path === 'manifestVersion')).toBe(true);
  });

  it('rejects a non-Photoshop host', () => {
    const broken = clone();
    (broken['host'] as Record<string, unknown>)['app'] = 'AI';
    expect(validateManifest(broken).some((issue) => issue.path === 'host.app')).toBe(true);
  });

  it('rejects unnecessary permissions', () => {
    const broken = clone();
    broken['requiredPermissions'] = { network: { domains: ['https://example.com'] } };
    expect(
      validateManifest(broken).some((issue) => issue.path === 'requiredPermissions.network'),
    ).toBe(true);
  });

  it('rejects a missing panel entrypoint', () => {
    const broken = clone();
    broken['entrypoints'] = [];
    expect(validateManifest(broken).some((issue) => issue.path === 'entrypoints')).toBe(true);
  });

  it('rejects a non-object manifest', () => {
    expect(validateManifest('nope')).toHaveLength(1);
  });
});
