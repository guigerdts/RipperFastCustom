/**
 * Semantic validation for a production-profile document.
 *
 * Structural parsing and the schema-version gate live in `parse.ts` and
 * `schema.ts`; this module assumes a well-formed document shape and checks the
 * values a profile must satisfy before the engine may run:
 *
 * - identity and metadata are present and plausible;
 * - output DPI and declared resolutions are usable;
 * - declared constraints are usable;
 * - channels, their screens and the output cell relation are valid;
 * - the separation is complete and consistent with the declared channels.
 *
 * Every failure carries a specific code, a document path and structured details,
 * so the operator sees what to change instead of a generic "invalid profile".
 * Errors reject a profile; warnings are reported but do not block it.
 */

import { isSafeProfileId } from './model';
import type { ProductionProfileDocument } from './model';
import { createProfileIssue, hasProfileErrors } from './diagnostics';
import type { ProfileIssue } from './diagnostics';
import { validateCellRelation, validateChannels } from './channel-validation';
import { validateSeparationDocument } from './separation-validation';
import { isIsoTimestamp, isNonEmptyString, isPositive } from './primitives';

/** Validates a profile and returns every diagnostic it found. */
export function validateProfileDocument(document: ProductionProfileDocument): ProfileIssue[] {
  const issues: ProfileIssue[] = [];

  issues.push(...validateIdentity(document));
  issues.push(...validateOutput(document));
  issues.push(...validateConstraints(document));

  const channels = validateChannels(document);
  issues.push(...channels.issues);
  issues.push(...validateCellRelation(document, channels.screening));
  issues.push(...validateSeparationDocument(document.separation, document));

  return issues;
}

function validateIdentity(document: ProductionProfileDocument): ProfileIssue[] {
  const issues: ProfileIssue[] = [];

  if (!isNonEmptyString(document.id)) {
    issues.push(
      createProfileIssue('profile.id_missing', 'The profile needs a stable identity.', 'id'),
    );
  } else if (!isSafeProfileId(document.id)) {
    issues.push(
      createProfileIssue(
        'profile.id_invalid',
        'The profile id must be 1-128 characters of letters, digits, dot, dash or underscore, starting with a letter or digit.',
        'id',
        { value: document.id },
      ),
    );
  }

  if (!isNonEmptyString(document.version)) {
    issues.push(
      createProfileIssue(
        'profile.version_missing',
        'The profile needs an operator-declared edition, for example "1".',
        'version',
      ),
    );
  }
  if (!isNonEmptyString(document.processKind)) {
    issues.push(
      createProfileIssue(
        'profile.process_kind_missing',
        'The profile needs a process kind, for example "screen-printing".',
        'processKind',
      ),
    );
  }

  const metadata = document.metadata;
  if (metadata === null || typeof metadata !== 'object') {
    issues.push(
      createProfileIssue('profile.missing_field', 'The profile needs metadata.', 'metadata'),
    );
    return issues;
  }
  if (!isNonEmptyString(metadata.name)) {
    issues.push(
      createProfileIssue(
        'profile.name_missing',
        'The profile needs a display name.',
        'metadata.name',
      ),
    );
  }
  for (const field of ['createdAt', 'updatedAt'] as const) {
    if (!isIsoTimestamp(metadata[field])) {
      issues.push(
        createProfileIssue(
          'profile.metadata_timestamp_invalid',
          `metadata.${field} must be an ISO 8601 timestamp.`,
          `metadata.${field}`,
          { value: String(metadata[field]) },
        ),
      );
    }
  }

  return issues;
}

function validateOutput(document: ProductionProfileDocument): ProfileIssue[] {
  const issues: ProfileIssue[] = [];
  const output = document.output;
  if (output === null || typeof output !== 'object') {
    issues.push(
      createProfileIssue('profile.missing_field', 'The profile needs output settings.', 'output'),
    );
    return issues;
  }

  const dpiUsable = isPositive(output.dpi);
  if (!dpiUsable) {
    issues.push(
      createProfileIssue(
        'profile.output_dpi_invalid',
        'Output DPI must be a finite number greater than zero.',
        'output.dpi',
        { value: String(output.dpi) },
      ),
    );
  }

  const allowed = output.allowedResolutions;
  if (allowed !== null) {
    const usable =
      Array.isArray(allowed) && allowed.length > 0 && allowed.every((value) => isPositive(value));
    if (!usable) {
      issues.push(
        createProfileIssue(
          'profile.allowed_resolutions_invalid',
          'allowedResolutions must be null or a non-empty list of finite DPI values greater than zero.',
          'output.allowedResolutions',
        ),
      );
    } else if (dpiUsable && !allowed.includes(output.dpi)) {
      issues.push(
        createProfileIssue(
          'profile.dpi_not_allowed',
          'The profile output DPI is not one of the resolutions it allows.',
          'output.dpi',
          { value: output.dpi, allowed: allowed.join(', ') },
        ),
      );
    }
  }

  return issues;
}

function validateConstraints(document: ProductionProfileDocument): ProfileIssue[] {
  const issues: ProfileIssue[] = [];
  const constraints = document.constraints;
  if (constraints === null || typeof constraints !== 'object') {
    issues.push(
      createProfileIssue(
        'profile.missing_field',
        'The profile needs a constraints object.',
        'constraints',
      ),
    );
    return issues;
  }

  for (const field of ['minimumCellPixels', 'minimumInputSamplesPerScreenLine'] as const) {
    const value = constraints[field];
    if (value !== null && !isPositive(value)) {
      issues.push(
        createProfileIssue(
          'profile.constraint_invalid',
          `constraints.${field} must be null or a finite value greater than zero.`,
          `constraints.${field}`,
          { value: String(value) },
        ),
      );
    }
  }

  return issues;
}

/** True when the profile may be saved and screened. */
export function isUsableProfile(document: ProductionProfileDocument): boolean {
  return !hasProfileErrors(validateProfileDocument(document));
}
