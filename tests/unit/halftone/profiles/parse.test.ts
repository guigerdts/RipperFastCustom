import { describe, expect, it } from 'vitest';
import { validProfile } from '../../../helpers/profileFixtures';
import {
  parseProfileDocument,
  parseProfileJson,
} from '../../../../src/modules/halftone-studio/profiles/parse';

function issuePaths(raw: unknown): string[] {
  const result = parseProfileDocument(raw);
  return result.ok ? [] : result.issues.map((issue) => issue.path);
}

describe('profile parsing', () => {
  it('parses a well-formed document as v1 without marking it migrated', () => {
    const result = parseProfileDocument(validProfile());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.migrated).toBe(false);
      expect(result.document.id).toBe('screen-print-cmyk');
      expect(result.document.channels).toHaveLength(4);
    }
  });

  it('drops unknown properties instead of carrying them', () => {
    const result = parseProfileDocument({ ...validProfile(), futureField: 'ignored' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(Object.keys(result.document)).not.toContain('futureField');
  });

  it('reports invalid JSON', () => {
    const result = parseProfileJson('{ not json');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]?.code).toBe('profile.invalid_document');
    }
  });

  it('reports a missing required section', () => {
    const raw = { ...validProfile() } as Record<string, unknown>;
    delete raw['channels'];
    expect(issuePaths(raw)).toContain('channels');
  });

  it('reports a wrong-typed output setting', () => {
    expect(issuePaths({ ...validProfile(), output: { dpi: 'lots' } })).toContain('output.dpi');
  });

  it('reports a non-numeric declared constraint', () => {
    expect(
      issuePaths({
        ...validProfile(),
        constraints: { minimumCellPixels: '4', minimumInputSamplesPerScreenLine: null },
      }),
    ).toContain('constraints.minimumCellPixels');
  });

  it('reports a non-string metadata description', () => {
    expect(
      issuePaths({
        ...validProfile(),
        metadata: { ...validProfile().metadata, description: 7 },
      }),
    ).toContain('metadata.description');
  });

  it('passes the schema gate before reading any field', () => {
    const result = parseProfileDocument({ schemaVersion: 99 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.code).toBe('profile.schema_version_unsupported');
  });
});
