/**
 * Schema versioning for production profiles.
 *
 * A profile is a document that outlives the build that wrote it. This module is
 * the single gate every stored or imported profile passes through:
 *
 * - a missing version is rejected, never guessed from the fields present;
 * - a version newer than this build knows is rejected, never coerced down;
 * - an older version is migrated forward by an explicit chain, one step per
 *   version, so a future schema change has a named, testable home.
 *
 * In schema v1 the chain is empty: v1 is both the oldest and the current
 * version, so a v1 document passes through untouched. The migration machinery
 * exists now precisely because adding it later, next to real data, is what
 * causes silent data loss.
 */

import { PROFILE_SCHEMA_VERSION } from './model';
import { createProfileIssue } from './diagnostics';
import type { ProfileIssue } from './diagnostics';

export const SUPPORTED_SCHEMA_VERSIONS = [PROFILE_SCHEMA_VERSION] as const;

export type SchemaGateResult =
  | { readonly ok: true; readonly version: number }
  | { readonly ok: false; readonly issues: readonly ProfileIssue[] };

/** Reads and validates `schemaVersion` without trusting any other field. */
export function checkSchemaVersion(raw: unknown): SchemaGateResult {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      ok: false,
      issues: [
        createProfileIssue(
          'profile.invalid_document',
          'A production profile must be a JSON object.',
          '$',
        ),
      ],
    };
  }

  const record = raw as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(record, 'schemaVersion')) {
    return {
      ok: false,
      issues: [
        createProfileIssue(
          'profile.schema_version_missing',
          `The profile declares no schemaVersion; this build reads version ${PROFILE_SCHEMA_VERSION}.`,
          'schemaVersion',
        ),
      ],
    };
  }

  const version = record['schemaVersion'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return {
      ok: false,
      issues: [
        createProfileIssue(
          'profile.schema_version_unsupported',
          'schemaVersion must be a positive integer.',
          'schemaVersion',
          { value: String(version) },
        ),
      ],
    };
  }

  if (version > PROFILE_SCHEMA_VERSION) {
    return {
      ok: false,
      issues: [
        createProfileIssue(
          'profile.schema_version_unsupported',
          `The profile uses schema version ${version}, newer than this build supports (${PROFILE_SCHEMA_VERSION}).`,
          'schemaVersion',
          { value: version, supported: PROFILE_SCHEMA_VERSION },
        ),
      ],
    };
  }

  return { ok: true, version };
}

/**
 * One forward migration: takes a document at `from` and returns it at
 * `from + 1`. Registering a step here is how a future version upgrades data;
 * there is no automatic field guessing.
 */
export type SchemaMigration = (document: Record<string, unknown>) => Record<string, unknown>;

/** Keyed by the version being migrated *from*. Empty in schema v1. */
export const SCHEMA_MIGRATIONS: Readonly<Record<number, SchemaMigration>> = {};

export type MigrationResult =
  | {
      readonly ok: true;
      readonly document: Record<string, unknown>;
      readonly migrated: boolean;
    }
  | { readonly ok: false; readonly issues: readonly ProfileIssue[] };

/**
 * Gates the schema version and migrates a raw document forward to the current
 * version. A document already at the current version is returned unchanged.
 */
export function migrateProfileDocument(raw: unknown): MigrationResult {
  const gate = checkSchemaVersion(raw);
  if (!gate.ok) return { ok: false, issues: gate.issues };

  let document = { ...(raw as Record<string, unknown>) };
  let version = gate.version;
  let migrated = false;

  while (version < PROFILE_SCHEMA_VERSION) {
    const step = SCHEMA_MIGRATIONS[version];
    if (step === undefined) {
      return {
        ok: false,
        issues: [
          createProfileIssue(
            'profile.schema_version_unsupported',
            `No migration is registered from schema version ${version} to ${version + 1}.`,
            'schemaVersion',
            { value: version, target: version + 1 },
          ),
        ],
      };
    }
    document = step(document);
    document['schemaVersion'] = version + 1;
    version += 1;
    migrated = true;
  }

  return { ok: true, document, migrated };
}
