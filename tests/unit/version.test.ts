import { describe, expect, it } from 'vitest';
import { compareVersions, isVersionAtLeast, parseVersion } from '../../src/validation/version';
import { MIN_PHOTOSHOP_VERSION } from '../../src/constants/app';

describe('parseVersion', () => {
  it('accepts dotted numeric versions', () => {
    expect(parseVersion('22.0.0')).toEqual([22, 0, 0]);
    expect(parseVersion(' 23 ')).toEqual([23]);
  });

  it('rejects anything else', () => {
    expect(parseVersion(null)).toBeNull();
    expect(parseVersion('')).toBeNull();
    expect(parseVersion('uxp-5.0.0')).toBeNull();
    expect(parseVersion('22.0.0-beta')).toBeNull();
    expect(parseVersion('a.b.c')).toBeNull();
  });
});

describe('compareVersions', () => {
  it('orders versions numerically, not lexically', () => {
    expect(compareVersions('22.0.0', '23.0.0')).toBe(-1);
    expect(compareVersions('23.0.0', '22.0.0')).toBe(1);
    expect(compareVersions('22.0.0', '22.0.0')).toBe(0);
    expect(compareVersions('9.0.0', '10.0.0')).toBe(-1);
    expect(compareVersions('22.0', '22.0.0')).toBe(0);
  });

  it('throws on unparseable input', () => {
    expect(() => compareVersions('abc', '1.0.0')).toThrow();
  });
});

describe('isVersionAtLeast', () => {
  it('matches the declared Photoshop floor', () => {
    expect(isVersionAtLeast('22.0.0', MIN_PHOTOSHOP_VERSION)).toBe(true);
    expect(isVersionAtLeast('22.5.1', MIN_PHOTOSHOP_VERSION)).toBe(true);
    expect(isVersionAtLeast('26.0.0', MIN_PHOTOSHOP_VERSION)).toBe(true);
    expect(isVersionAtLeast('21.1.0', MIN_PHOTOSHOP_VERSION)).toBe(false);
  });

  it('returns false for missing or malformed versions', () => {
    expect(isVersionAtLeast(null, MIN_PHOTOSHOP_VERSION)).toBe(false);
    expect(isVersionAtLeast(undefined, MIN_PHOTOSHOP_VERSION)).toBe(false);
    expect(isVersionAtLeast('not-a-version', MIN_PHOTOSHOP_VERSION)).toBe(false);
  });
});
