/** Numeric dotted-version helpers used by compatibility validation. */

export function parseVersion(input: string | null | undefined): number[] | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!/^\d+(\.\d+)*$/.test(trimmed)) return null;
  return trimmed.split('.').map((part) => Number.parseInt(part, 10));
}

export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) throw new Error(`invalid_version:${a}|${b}`);

  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    if (l < r) return -1;
    if (l > r) return 1;
  }
  return 0;
}

export function isVersionAtLeast(actual: string | null | undefined, minimum: string): boolean {
  if (typeof actual !== 'string' || !parseVersion(actual)) return false;
  return compareVersions(actual, minimum) >= 0;
}
