/**
 * Diagnostics for the production-profile document.
 *
 * These are deliberately separate from the engine's `Issue` registry
 * (`engines/halftone/contracts/issue.ts`). A production profile is host- and
 * engine-independent: it must validate with no Photoshop present and without
 * borrowing the engine's vocabulary, and the engine registry must not grow codes
 * for concerns it never evaluates. The adapter (`engine-adapter.ts`) is the one
 * seam that hands the engine its own `Issue[]`.
 *
 * Every code declares its severity once. The same condition always reports the
 * same code and severity; a caller cannot downgrade an error to a warning.
 */

export type ProfileIssueSeverity = 'error' | 'warning' | 'info';

/** Structured, JSON-safe facts about a diagnostic. */
export type ProfileIssueDetails = Readonly<Record<string, string | number | boolean | null>>;

/**
 * Central registry. `severity` is fixed per code. Errors reject a profile;
 * warnings and info do not.
 */
export const PROFILE_ISSUE_REGISTRY = {
  'profile.invalid_document': { severity: 'error' },
  'profile.schema_version_missing': { severity: 'error' },
  'profile.schema_version_unsupported': { severity: 'error' },
  'profile.missing_field': { severity: 'error' },
  'profile.invalid_field': { severity: 'error' },
  'profile.id_missing': { severity: 'error' },
  'profile.id_invalid': { severity: 'error' },
  'profile.version_missing': { severity: 'error' },
  'profile.name_missing': { severity: 'error' },
  'profile.process_kind_missing': { severity: 'error' },
  'profile.metadata_timestamp_invalid': { severity: 'error' },
  'profile.no_channels': { severity: 'error' },
  'profile.duplicate_channel_id': { severity: 'error' },
  'profile.duplicate_ink_name': { severity: 'error' },
  'profile.output_dpi_invalid': { severity: 'error' },
  'profile.allowed_resolutions_invalid': { severity: 'error' },
  'profile.dpi_not_allowed': { severity: 'error' },
  'profile.constraint_invalid': { severity: 'error' },
  'profile.cell_too_small': { severity: 'error' },
  'profile.minimum_cell_not_met': { severity: 'warning' },
  'channel.data_kind_invalid': { severity: 'error' },
  'channel.display_color_invalid': { severity: 'error' },
  'channel.lpi_invalid': { severity: 'error' },
  'channel.angle_invalid': { severity: 'error' },
  'channel.dot_shape_unknown': { severity: 'error' },
  'separation.mode_unsupported': { severity: 'error' },
  'separation.channel_map_empty': { severity: 'error' },
  'separation.channel_map_unknown': { severity: 'error' },
  'separation.channel_map_mask': { severity: 'error' },
  'separation.matrix_empty': { severity: 'error' },
  'separation.matrix_row_count': { severity: 'error' },
  'separation.matrix_shape': { severity: 'error' },
  'separation.matrix_value_invalid': { severity: 'error' },
} as const satisfies Record<string, { readonly severity: ProfileIssueSeverity }>;

export type ProfileIssueCode = keyof typeof PROFILE_ISSUE_REGISTRY;

export interface ProfileIssue {
  readonly code: ProfileIssueCode;
  readonly severity: ProfileIssueSeverity;
  readonly message: string;
  /** Document path the issue refers to, for example `channels[0].screening.lpi`. */
  readonly path: string;
  readonly details?: ProfileIssueDetails;
}

export function createProfileIssue(
  code: ProfileIssueCode,
  message: string,
  path: string,
  details?: ProfileIssueDetails,
): ProfileIssue {
  const { severity } = PROFILE_ISSUE_REGISTRY[code];
  return details === undefined
    ? { code, severity, message, path }
    : { code, severity, message, path, details };
}

/** True when any issue would block creating, saving or screening the profile. */
export function hasProfileErrors(issues: readonly ProfileIssue[]): boolean {
  return issues.some((issue) => issue.severity === 'error');
}
