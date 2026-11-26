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
  'profile.missing_am_parameter': { severity: 'error', scope: 'profile' },
  'profile.invalid_am_parameter': { severity: 'error', scope: 'profile' },
  'profile.unsupported_method': { severity: 'error', scope: 'profile' },
  'profile.duplicate_channel_angles': { severity: 'warning', scope: 'profile' },
  'channel.trc_ambiguous': { severity: 'error', scope: 'channel' },
  'channel.trc_out_of_range': { severity: 'error', scope: 'channel' },
  'channel.trc_non_monotonic': { severity: 'info', scope: 'channel' },
  'channel.limits_invalid': { severity: 'error', scope: 'channel' },
  'channel.limits_identity': { severity: 'warning', scope: 'channel' },
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
 * Builds an issue from the registry. Throws when the code is not registered:
 * a module cannot emit a code it did not declare centrally.
 */
export function createIssue(code: IssueCode, message: string, context: IssueContext = {}): Issue {
  const definition = (ISSUE_REGISTRY as Record<string, IssueDefinition | undefined>)[code];
  if (definition === undefined) {
    throw new Error(`Unregistered issue code: ${String(code)}`);
  }
  return { code, severity: definition.severity, scope: definition.scope, message, context };
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
