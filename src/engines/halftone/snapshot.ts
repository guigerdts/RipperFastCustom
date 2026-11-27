/**
 * Snapshot sealing and verification.
 *
 * The snapshot is built as a plain record of effective values, sealed by
 * hashing its canonical bytes, then deep-copied and frozen so a later mutation
 * of the caller's request or profile cannot reach it. Verification recomputes
 * the hash from the embedded values, which proves the record is self-contained
 * and unmodified.
 */

import { binary, canonicalText, hashCanonical, sha256Hex, type CanonicalValue } from './canonical';
import { CANONICALISATION_VERSION } from './contracts/separation';
import { createIssue, type Issue } from './contracts/issue';
import type { ResultSnapshot, UnsealedSnapshot } from './contracts/result';

/**
 * Converts any plain record into a canonical value.
 *
 * Every own field is included, so a field added to the snapshot later cannot be
 * silently left out of the hash. Values that have no deterministic encoding —
 * `undefined`, functions, symbols, class instances — throw instead of being
 * skipped.
 */
export function toCanonicalValue(value: unknown, path = '$'): CanonicalValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') return value;
  if (value instanceof Uint8Array) return binary(value);

  if (Array.isArray(value)) {
    return value.map((entry, index) => toCanonicalValue(entry, `${path}[${index}]`));
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const converted: Record<string, CanonicalValue> = {};
    for (const key of Object.keys(record)) {
      const entry = record[key];
      if (entry === undefined) {
        throw new TypeError(`Snapshot field has no value at ${path}.${key}.`);
      }
      converted[key] = toCanonicalValue(entry, `${path}.${key}`);
    }
    return converted;
  }

  throw new TypeError(`Snapshot field has no canonical encoding at ${path}.`);
}

/** Canonical value of an unsealed snapshot: every field except the hash. */
export function snapshotCanonicalValue(snapshot: UnsealedSnapshot): CanonicalValue {
  return toCanonicalValue(snapshot);
}

/** Canonical text of an unsealed snapshot. */
export function snapshotCanonicalText(snapshot: UnsealedSnapshot): string {
  return canonicalText(snapshotCanonicalValue(snapshot));
}

function cloneAndFreeze<T>(value: T): T {
  if (value instanceof Uint8Array) {
    return new Uint8Array(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    const copy = value.map((entry) => cloneAndFreeze(entry));
    return Object.freeze(copy) as unknown as T;
  }
  if (typeof value === 'object' && value !== null) {
    const source = value as Record<string, unknown>;
    const copy: Record<string, unknown> = {};
    for (const key of Object.keys(source)) {
      copy[key] = cloneAndFreeze(source[key]);
    }
    return Object.freeze(copy) as T;
  }
  return value;
}

/**
 * Seals an unsealed snapshot: hashes its canonical bytes, then returns a
 * deep-copied, deeply frozen record. The input is not mutated or retained.
 */
export function sealSnapshot(snapshot: UnsealedSnapshot): ResultSnapshot {
  const hash = hashCanonical(snapshotCanonicalValue(snapshot));
  const sealed: ResultSnapshot = { ...cloneAndFreeze(snapshot), hash };
  return Object.freeze(sealed);
}

/** The embedded effective parameters of a sealed snapshot, as a fresh copy. */
export function snapshotParameters(snapshot: ResultSnapshot): UnsealedSnapshot {
  const rest: Record<string, unknown> = {};
  for (const key of Object.keys(snapshot)) {
    if (key === 'hash') continue;
    rest[key] = (snapshot as unknown as Record<string, unknown>)[key];
  }
  return cloneAndFreeze(rest as unknown as UnsealedSnapshot);
}

/** Recomputes the snapshot hash from its embedded values. */
export function recomputeSnapshotHash(snapshot: ResultSnapshot): string {
  return hashCanonical(snapshotCanonicalValue(snapshotParameters(snapshot)));
}

/**
 * Verifies a sealed snapshot: the recorded hash must equal the hash of the
 * embedded values, and the recorded canonicalisation version must be the one
 * this engine produces.
 */
export function verifySnapshot(snapshot: ResultSnapshot): {
  readonly ok: boolean;
  readonly issues: readonly Issue[];
} {
  const issues: Issue[] = [];

  if (snapshot.canonicalisationVersion !== CANONICALISATION_VERSION) {
    issues.push(
      createIssue(
        'output.snapshot_invalid',
        'The snapshot declares a canonicalisation version this engine does not produce.',
        {
          offendingValue: snapshot.canonicalisationVersion,
          expected: CANONICALISATION_VERSION,
          parameter: 'canonicalisationVersion',
        },
      ),
    );
    return { ok: false, issues };
  }

  const recomputed = recomputeSnapshotHash(snapshot);
  if (recomputed !== snapshot.hash) {
    issues.push(
      createIssue('output.snapshot_invalid', 'The snapshot hash does not match its contents.', {
        offendingValue: snapshot.hash,
        expected: recomputed,
        parameter: 'hash',
      }),
    );
    return { ok: false, issues };
  }

  return { ok: true, issues };
}

/**
 * Verifies that an ICC separation's embedded profile bytes are present and
 * match the hashes recorded in the provenance. A hash without its bytes cannot
 * reproduce the run.
 */
export function verifyEmbeddedProfiles(snapshot: ResultSnapshot): {
  readonly ok: boolean;
  readonly issues: readonly Issue[];
} {
  const separation = snapshot.separation;
  if (separation.mode !== 'icc') return { ok: true, issues: [] };

  const issues: Issue[] = [];
  const pairs = [
    {
      name: 'source',
      bytes: separation.sourceProfileBytes,
      hash: separation.provenance.sourceProfileHash,
    },
    {
      name: 'destination',
      bytes: separation.destinationProfileBytes,
      hash: separation.provenance.destinationProfileHash,
    },
  ];

  for (const pair of pairs) {
    if (!(pair.bytes instanceof Uint8Array) || pair.bytes.length === 0) {
      issues.push(
        createIssue(
          'separation.unreproducible_transform',
          `The ICC ${pair.name} profile bytes were not captured, so the run cannot be reproduced.`,
          {
            expected: `captured ${pair.name} profile bytes`,
            parameter: `${pair.name}ProfileBytes`,
            details: { recordedHash: pair.hash },
          },
        ),
      );
      continue;
    }

    const actual = sha256Hex(pair.bytes);
    if (actual !== pair.hash) {
      issues.push(
        createIssue(
          'separation.unreproducible_transform',
          `The ICC ${pair.name} profile bytes do not match the recorded hash.`,
          {
            offendingValue: actual,
            expected: pair.hash,
            parameter: `${pair.name}ProfileHash`,
          },
        ),
      );
    }
  }

  return { ok: issues.length === 0, issues };
}
