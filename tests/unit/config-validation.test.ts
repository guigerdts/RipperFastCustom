import { describe, expect, it } from 'vitest';
import { DEFAULT_APP_CONFIG, validateAppConfig } from '../../src/validation/config';

describe('validateAppConfig', () => {
  it('returns defaults for a missing configuration', () => {
    const { config, issues } = validateAppConfig(undefined);
    expect(config).toEqual(DEFAULT_APP_CONFIG);
    expect(issues).toHaveLength(1);
  });

  it('returns defaults for a non-object configuration', () => {
    const { config, issues } = validateAppConfig('es');
    expect(config.locale).toBe('es');
    expect(issues[0]).toContain('must be an object');
  });

  it('accepts a supported locale', () => {
    const { config, issues } = validateAppConfig({ locale: 'en' });
    expect(config.locale).toBe('en');
    expect(issues).toEqual([]);
  });

  it('rejects an unsupported locale and keeps the default', () => {
    const { config, issues } = validateAppConfig({ locale: 'de' });
    expect(config.locale).toBe('es');
    expect(issues.some((issue) => issue.includes('"de"'))).toBe(true);
  });

  it('reports a missing locale without failing', () => {
    const { config, issues } = validateAppConfig({});
    expect(config.locale).toBe('es');
    expect(issues).toEqual(['locale missing; using default']);
  });
});
