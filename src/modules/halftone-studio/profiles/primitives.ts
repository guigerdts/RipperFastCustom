/**
 * Small value predicates shared by the profile validators.
 *
 * They live in one place so every module agrees on what "a finite number", "a
 * non-empty name" or "an ISO timestamp" means. Each is total: it never throws on
 * an unexpected input.
 */

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isPositive(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Accepts any value `Date.parse` reads as a valid instant. */
export function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim().length === 0) return false;
  return Number.isFinite(Date.parse(value));
}
