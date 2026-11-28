/**
 * Shared value readers for structural profile parsing.
 *
 * Each reader either returns the value it read or records one diagnostic and
 * returns `null`/`undefined`, so the calling parser can decide whether a section
 * is complete. Nothing here coerces: a number read as a string is a diagnostic,
 * not a conversion.
 */

import { createProfileIssue } from './diagnostics';
import type { ProfileIssue } from './diagnostics';

export type Record_ = Record<string, unknown>;

export function isRecord(value: unknown): value is Record_ {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function expectString(value: unknown, path: string, issues: ProfileIssue[]): string | null {
  if (typeof value === 'string') return value;
  issues.push(
    createProfileIssue(
      'profile.missing_field',
      `"${path}" must be a string.`,
      path,
      value === undefined ? undefined : { value: String(value) },
    ),
  );
  return null;
}

export function expectNumber(value: unknown, path: string, issues: ProfileIssue[]): number | null {
  if (typeof value === 'number') return value;
  issues.push(
    createProfileIssue(
      'profile.missing_field',
      `"${path}" must be a number.`,
      path,
      value === undefined ? undefined : { value: String(value) },
    ),
  );
  return null;
}

export function expectNullableNumber(
  value: unknown,
  path: string,
  issues: ProfileIssue[],
): number | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  issues.push(
    createProfileIssue('profile.invalid_field', `"${path}" must be a number or null.`, path),
  );
  return undefined;
}

export function expectNullableString(
  value: unknown,
  path: string,
  issues: ProfileIssue[],
): string | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  issues.push(
    createProfileIssue('profile.invalid_field', `"${path}" must be a string or null.`, path),
  );
  return undefined;
}
