/**
 * Entry points for reading a stored or imported production profile.
 *
 * The schema gate runs first (`schema.ts`), then the document, its metadata and
 * its output settings are read, and the channel and separation sections are
 * delegated to their own readers. Semantic rules live in `validation.ts`.
 *
 * The result is total: it never throws and never coerces a value it cannot read.
 */

import type { ProfileMetadata, ProfileOutput, ProductionProfileDocument } from './model';
import { PROFILE_SCHEMA_VERSION } from './model';
import { createProfileIssue } from './diagnostics';
import type { ProfileIssue } from './diagnostics';
import { migrateProfileDocument } from './schema';
import { readChannels } from './parse-channel';
import { readSeparation } from './parse-separation';
import {
  expectNullableNumber,
  expectNullableString,
  expectNumber,
  expectString,
  isRecord,
  type Record_,
} from './parse-readers';

export type ProfileParseResult =
  | { readonly ok: true; readonly document: ProductionProfileDocument; readonly migrated: boolean }
  | { readonly ok: false; readonly issues: readonly ProfileIssue[] };

/** Parses an already-decoded JSON value into a profile document. */
export function parseProfileDocument(raw: unknown): ProfileParseResult {
  const migration = migrateProfileDocument(raw);
  if (!migration.ok) return { ok: false, issues: migration.issues };

  const issues: ProfileIssue[] = [];
  const document = readDocument(migration.document, issues);

  if (document === null || issues.length > 0) {
    return { ok: false, issues };
  }
  return { ok: true, document, migrated: migration.migrated };
}

/** Parses JSON text and then validates its profile shape. */
export function parseProfileJson(json: string): ProfileParseResult {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return {
      ok: false,
      issues: [
        createProfileIssue('profile.invalid_document', 'The profile is not valid JSON.', '$'),
      ],
    };
  }
  return parseProfileDocument(value);
}

function readDocument(record: Record_, issues: ProfileIssue[]): ProductionProfileDocument | null {
  const id = expectString(record['id'], 'id', issues);
  const version = expectString(record['version'], 'version', issues);
  const processKind = expectString(record['processKind'], 'processKind', issues);

  const metadata = readMetadata(record['metadata'], issues);
  const output = readOutput(record['output'], issues);
  const constraints = readConstraints(record['constraints'], issues);
  const separation = readSeparation(record['separation'], issues);
  const channels = readChannels(record['channels'], issues);

  if (
    id === null ||
    version === null ||
    processKind === null ||
    metadata === null ||
    output === null ||
    constraints === null ||
    separation === null ||
    channels === null
  ) {
    return null;
  }

  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    id,
    version,
    processKind,
    metadata,
    output,
    constraints,
    separation,
    channels,
  };
}

function readMetadata(value: unknown, issues: ProfileIssue[]): ProfileMetadata | null {
  if (!isRecord(value)) {
    issues.push(
      createProfileIssue('profile.missing_field', 'The profile needs metadata.', 'metadata'),
    );
    return null;
  }

  const name = expectString(value['name'], 'metadata.name', issues);
  const description = expectNullableString(value['description'], 'metadata.description', issues);
  const createdAt = expectString(value['createdAt'], 'metadata.createdAt', issues);
  const updatedAt = expectString(value['updatedAt'], 'metadata.updatedAt', issues);

  if (name === null || description === undefined || createdAt === null || updatedAt === null) {
    return null;
  }
  return { name, description, createdAt, updatedAt };
}

function readOutput(value: unknown, issues: ProfileIssue[]): ProfileOutput | null {
  if (!isRecord(value)) {
    issues.push(
      createProfileIssue('profile.missing_field', 'The profile needs output settings.', 'output'),
    );
    return null;
  }

  const dpi = expectNumber(value['dpi'], 'output.dpi', issues);
  const allowedRaw = value['allowedResolutions'];
  let allowedResolutions: readonly number[] | null = null;

  if (allowedRaw !== null && allowedRaw !== undefined) {
    if (!Array.isArray(allowedRaw) || allowedRaw.some((entry) => typeof entry !== 'number')) {
      issues.push(
        createProfileIssue(
          'profile.invalid_field',
          'output.allowedResolutions must be null or a list of numbers.',
          'output.allowedResolutions',
        ),
      );
    } else {
      allowedResolutions = allowedRaw as number[];
    }
  }

  if (dpi === null) return null;
  return { dpi, allowedResolutions };
}

function readConstraints(
  value: unknown,
  issues: ProfileIssue[],
): ProductionProfileDocument['constraints'] | null {
  if (!isRecord(value)) {
    issues.push(
      createProfileIssue(
        'profile.missing_field',
        'The profile needs a constraints object.',
        'constraints',
      ),
    );
    return null;
  }

  const minimumCellPixels = expectNullableNumber(
    value['minimumCellPixels'],
    'constraints.minimumCellPixels',
    issues,
  );
  const minimumInputSamplesPerScreenLine = expectNullableNumber(
    value['minimumInputSamplesPerScreenLine'],
    'constraints.minimumInputSamplesPerScreenLine',
    issues,
  );

  if (minimumCellPixels === undefined || minimumInputSamplesPerScreenLine === undefined) {
    return null;
  }
  return { minimumCellPixels, minimumInputSamplesPerScreenLine };
}
