/**
 * Shared issue contract for the halftone engine.
 *
 * Every engine stage emits issues through this module. The registry is the
 * single source of truth for a code's severity and scope: a stage cannot
 * invent a code, and the same condition always yields the same code, severity
 * and scope. Ticket 09 completes the full vocabulary from the spec; this
 * module seeds the codes the contract-level validations already emit.
 */

export type IssueSeverity = 'error' | 'warning' | 'info';

export type IssueScope =
  'input' | 'profile' | 'channel' | 'geometry' | 'separation' | 'output' | 'preview';

/** A JSON-serialisable value carried as structured diagnostic context. */
export type JsonValue =
  string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue };

/**
 * Structured context for an issue. A free-form message is never the only
 * carrier of a diagnosis: the offending value, the expected constraint and the
 * relevant identifiers are recorded here.
 */
export interface IssueContext {
  /** The value that failed validation, when one exists. */
  readonly offendingValue?: JsonValue;
  /** The constraint that was expected, described for humans. */
  readonly expected?: string;
  /** The ink channel the issue belongs to, when relevant. */
  readonly channel?: string;
  /** The parameter that failed validation, when relevant. */
  readonly parameter?: string;
  /** The profile field that failed validation, when relevant. */
  readonly profileField?: string;
  /** Additional structured facts about the failure. */
  readonly details?: Readonly<Record<string, JsonValue>>;
}

export interface IssueDefinition {
  readonly severity: IssueSeverity;
  readonly scope: IssueScope;
}

/**
 * Central registry. A code is added here once and never redefined. Severity
 * and scope are fixed per code so the same condition is always reported the
 * same way.
 */
export const ISSUE_REGISTRY = {
  'input.invalid_dimensions': { severity: 'error', scope: 'input' },
  'input.ppi_missing': { severity: 'error', scope: 'input' },
  'input.invalid_ppi': { severity: 'error', scope: 'input' },
  'input.unsupported_bit_depth': { severity: 'error', scope: 'input' },
  'input.unsupported_layout': { severity: 'error', scope: 'input' },
  'input.data_size_mismatch': { severity: 'error', scope: 'input' },
  'input.prepared_artwork': { severity: 'error', scope: 'input' },
  'input.prepared_artwork_override': { severity: 'warning', scope: 'input' },
  'input.prepared_artwork_override_reason_missing': { severity: 'error', scope: 'input' },
  'profile.missing_am_parameter': { severity: 'error', scope: 'profile' },
  'profile.invalid_am_parameter': { severity: 'error', scope: 'profile' },
  'profile.unsupported_method': { severity: 'error', scope: 'profile' },
  'profile.duplicate_channel_angles': { severity: 'warning', scope: 'profile' },
  'channel.trc_ambiguous': { severity: 'error', scope: 'channel' },
  'channel.trc_out_of_range': { severity: 'error', scope: 'channel' },
  'channel.trc_non_monotonic': { severity: 'info', scope: 'channel' },
  'channel.limits_invalid': { severity: 'error', scope: 'channel' },
  'channel.limits_identity': { severity: 'warning', scope: 'channel' },
  'channel.tonal_input_invalid': { severity: 'error', scope: 'channel' },
  'channel.white_requires_mask': { severity: 'error', scope: 'channel' },
  'separation.invalid_input': { severity: 'error', scope: 'separation' },
  'separation.undeclared_mapping': { severity: 'error', scope: 'separation' },
  'separation.invalid_mapping': { severity: 'error', scope: 'separation' },
  'separation.channel_count_mismatch': { severity: 'error', scope: 'separation' },
  'separation.invalid_matrix': { severity: 'error', scope: 'separation' },
  'separation.invalid_transfer_function': { severity: 'error', scope: 'separation' },
  'separation.unidentifiable_transform': { severity: 'error', scope: 'separation' },
  'separation.invalid_transform_output': { severity: 'error', scope: 'separation' },
  'separation.mask_source_missing': { severity: 'error', scope: 'separation' },
  'separation.mask_source_invalid': { severity: 'error', scope: 'separation' },
  'separation.unreproducible_transform': { severity: 'error', scope: 'separation' },
  'geometry.invalid_input': { severity: 'error', scope: 'geometry' },
  'geometry.empty_canvas': { severity: 'error', scope: 'geometry' },
  'geometry.unknown_dot_shape': { severity: 'error', scope: 'geometry' },
  'output.invalid_dimension': { severity: 'error', scope: 'output' },
  'output.snapshot_invalid': { severity: 'error', scope: 'output' },
} as const satisfies Record<string, IssueDefinition>;

export type IssueCode = keyof typeof ISSUE_REGISTRY;

export interface Issue {
  readonly code: IssueCode;
  readonly severity: IssueSeverity;
  readonly scope: IssueScope;
  readonly message: string;
  readonly context: IssueContext;
}

/** Narrows an arbitrary string to a registered code. */
export function isRegisteredIssueCode(code: string): code is IssueCode {
  return Object.prototype.hasOwnProperty.call(ISSUE_REGISTRY, code);
}

/**
 * Converts any value into a JSON-safe value deterministically. Non-finite
 * numbers (`NaN`, `Infinity`, `-Infinity`) cannot survive JSON encoding as
 * numbers, so they are preserved as diagnostic text instead of collapsing to
 * `null`. Objects and arrays are normalised recursively.
 */
export function toJsonValue(value: unknown): JsonValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'function' || typeof value === 'symbol') return String(value);
  if (Array.isArray(value)) return value.map((entry) => toJsonValue(entry));

  const record: { [key: string]: JsonValue } = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    record[key] = toJsonValue(entry);
  }
  return record;
}

/** Normalises every context field through {@link toJsonValue}. */
function normalizeIssueContext(context: IssueContext): IssueContext {
  const normalized: {
    offendingValue?: JsonValue;
    expected?: string;
    channel?: string;
    parameter?: string;
    profileField?: string;
    details?: Readonly<Record<string, JsonValue>>;
  } = {};

  if (context.offendingValue !== undefined) {
    normalized.offendingValue = toJsonValue(context.offendingValue);
  }
  if (context.expected !== undefined) normalized.expected = context.expected;
  if (context.channel !== undefined) normalized.channel = context.channel;
  if (context.parameter !== undefined) normalized.parameter = context.parameter;
  if (context.profileField !== undefined) normalized.profileField = context.profileField;
  if (context.details !== undefined) {
    const details: { [key: string]: JsonValue } = {};
    for (const [key, entry] of Object.entries(context.details)) {
      details[key] = toJsonValue(entry);
    }
    normalized.details = details;
  }

  return normalized;
}

/**
 * Builds an issue from the registry. Throws when the code is not registered:
 * a module cannot emit a code it did not declare centrally. The structured
 * context is normalised so the issue is always JSON-serialisable without loss.
 */
export function createIssue(code: IssueCode, message: string, context: IssueContext = {}): Issue {
  const definition = (ISSUE_REGISTRY as Record<string, IssueDefinition | undefined>)[code];
  if (definition === undefined) {
    throw new Error(`Unregistered issue code: ${String(code)}`);
  }
  return {
    code,
    severity: definition.severity,
    scope: definition.scope,
    message,
    context: normalizeIssueContext(context),
  };
}

/**
 * Fixed outcome semantics: any error rejects the run; warnings and info allow a
 * completed result; info never changes the outcome on its own.
 */
export function resolveOutcomeStatus(
  issues: readonly Pick<Issue, 'severity'>[],
): 'rejected' | 'completed' {
  return issues.some((issue) => issue.severity === 'error') ? 'rejected' : 'completed';
}
