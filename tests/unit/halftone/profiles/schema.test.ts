import { describe, expect, it } from 'vitest';
import { validProfile } from '../../../helpers/profileFixtures';
import {
  checkSchemaVersion,
  migrateProfileDocument,
} from '../../../../src/modules/halftone-studio/profiles/schema';

describe('schema versioning', () => {
  it('accepts the version this build reads', () => {
    expect(checkSchemaVersion(validProfile())).toEqual({ ok: true, version: 1 });
  });

  it('rejects a non-object document', () => {
    const gate = checkSchemaVersion([]);
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.issues[0]?.code).toBe('profile.invalid_document');
  });

  it('rejects a missing version instead of inferring it', () => {
    const gate = checkSchemaVersion({ id: 'x' });
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.issues[0]?.code).toBe('profile.schema_version_missing');
  });

  it('rejects a non-integer or non-positive version', () => {
    for (const schemaVersion of ['1', 0, 1.5, null]) {
      const gate = checkSchemaVersion({ schemaVersion });
      expect(gate.ok).toBe(false);
      if (!gate.ok) expect(gate.issues[0]?.code).toBe('profile.schema_version_unsupported');
    }
  });

  it('rejects a version newer than this build supports', () => {
    const gate = checkSchemaVersion({ schemaVersion: 2 });
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.issues[0]?.code).toBe('profile.schema_version_unsupported');
  });

  it('passes a v1 document through without marking it migrated', () => {
    const document = validProfile();
    const result = migrateProfileDocument(document);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.migrated).toBe(false);
      expect(result.document).toEqual(document);
    }
  });

  it('refuses to migrate when no step is registered', () => {
    const result = migrateProfileDocument({ schemaVersion: 2 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.code).toBe('profile.schema_version_unsupported');
  });
});
