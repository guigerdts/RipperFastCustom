/** Small, dependency-free feature-detection helpers shared by all adapters. */

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** True when the member exists on the object or its prototype chain. */
export function hasMember(value: unknown, key: string): boolean {
  return isObject(value) && key in value;
}

export function isFunction(value: unknown): value is (...args: never[]) => unknown {
  return typeof value === 'function';
}

/**
 * Normalises a numeric host value. Photoshop may return either a plain number
 * or a unit-bearing object depending on host version; anything else is null.
 */
export function readFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (isObject(value)) {
    const inner = value['value'];
    if (typeof inner === 'number' && Number.isFinite(inner)) return inner;
  }
  return null;
}

export function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}
