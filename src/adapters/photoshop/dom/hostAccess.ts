/**
 * Shared read-only access helpers for the API v1 adapter.
 * Every accessor checks member availability before touching host objects, so
 * an incompatible host degrades to `null` instead of throwing.
 */
import { hasMember, isObject, readFiniteNumber, readNonEmptyString } from '../../featureDetect';

export type UnknownRecord = Record<string, unknown>;

export function readApp(moduleValue: unknown): UnknownRecord | null {
  if (!isObject(moduleValue)) return null;
  const app = moduleValue['app'];
  return isObject(app) ? app : null;
}

export function readActiveDocument(moduleValue: unknown): UnknownRecord | null {
  const app = readApp(moduleValue);
  if (!app || !hasMember(app, 'activeDocument')) return null;
  try {
    const doc = app['activeDocument'];
    return isObject(doc) ? doc : null;
  } catch {
    // Photoshop throws when no document is open on some host versions.
    return null;
  }
}

export function readMemberNumber(owner: unknown, key: string): number | null {
  if (!hasMember(owner, key)) return null;
  try {
    return readFiniteNumber((owner as UnknownRecord)[key]);
  } catch {
    return null;
  }
}

export function readMemberString(owner: unknown, key: string): string | null {
  if (!hasMember(owner, key)) return null;
  try {
    return readNonEmptyString((owner as UnknownRecord)[key]);
  } catch {
    return null;
  }
}

/** Reads `owner[key].length`, checking each step before touching it. */
export function readMemberLength(owner: unknown, key: string): number | null {
  if (!hasMember(owner, key)) return null;
  try {
    return readMemberNumber((owner as UnknownRecord)[key], 'length');
  } catch {
    return null;
  }
}
