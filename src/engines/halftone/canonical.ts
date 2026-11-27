/**
 * Versioned canonicalisation and SHA-256 for the halftone snapshot.
 *
 * The canonical form is a deterministic, locale-free text encoding of the
 * snapshot's effective parameters. It is JSON-shaped but not JSON: numbers are
 * emitted as their exact IEEE-754 binary64 bit pattern (`0x` plus sixteen
 * lowercase hex digits, big-endian) and binary payloads as `#b64:` plus
 * standard base64. Because neither token can appear where a JSON value is
 * expected, a string can never be confused with a number or a byte payload.
 *
 * Rules (canonicalisation version 1):
 *
 * - object keys are sorted by Unicode code point, not by UTF-16 code unit;
 * - no insignificant whitespace is emitted;
 * - strings are JSON-quoted, so they are UTF-8 and escape-stable;
 * - arrays preserve their order;
 * - the output carries no timestamp, path, host identifier or locale.
 *
 * The encoding is pure: no host modules, no I/O, no global state.
 */

import { CANONICALISATION_VERSION } from './contracts/separation';

/** Canonicalisation version this module produces. */
export const CANONICAL_FORM_VERSION = CANONICALISATION_VERSION;

/** A binary payload tagged for canonical encoding. */
export interface CanonicalBinary {
  readonly __canonicalBinary: true;
  readonly bytes: Uint8Array;
}

/** Values the canonicaliser accepts. */
export type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | CanonicalBinary
  | readonly CanonicalValue[]
  | { readonly [key: string]: CanonicalValue };

/** Tags a byte payload so it is encoded as base64 rather than as an object. */
export function binary(bytes: Uint8Array): CanonicalBinary {
  return { __canonicalBinary: true, bytes };
}

function isBinary(value: unknown): value is CanonicalBinary {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { __canonicalBinary?: unknown }).__canonicalBinary === true &&
    (value as { bytes?: unknown }).bytes instanceof Uint8Array
  );
}

/** Encodes a finite or non-finite binary64 value as `0x` plus sixteen hex digits. */
export function encodeBinary64(value: number): string {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value, false);
  let hex = '';
  for (let index = 0; index < 8; index += 1) {
    hex += view.getUint8(index).toString(16).padStart(2, '0');
  }
  return `0x${hex}`;
}

/** Standard base64 alphabet; the encoding preserves case because it must stay injective. */
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Encodes bytes as standard base64 without line breaks.
 *
 * Case is preserved on purpose. Folding to lowercase is not injective —
 * base64 is case-sensitive, so `[0x00]` and `[0x68]` both become `aa==` — and a
 * colliding payload would defeat the snapshot's content-addressing. The
 * canonicalisation spec asks for "lowercase base64"; that literal requirement
 * is unachievable together with injectivity, so the encoding stays
 * case-sensitive and the deviation is recorded in the ticket.
 */
export function encodeBase64(bytes: Uint8Array): string {
  let out = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const hasSecond = index + 1 < bytes.length;
    const hasThird = index + 2 < bytes.length;
    const second = bytes[index + 1] ?? 0;
    const third = bytes[index + 2] ?? 0;

    out += BASE64_ALPHABET[first >> 2] ?? '';
    out += BASE64_ALPHABET[((first & 0b11) << 4) | (second >> 4)] ?? '';
    out += hasSecond ? (BASE64_ALPHABET[((second & 0b1111) << 2) | (third >> 6)] ?? '=') : '=';
    out += hasThird ? (BASE64_ALPHABET[third & 0b111111] ?? '=') : '=';
  }
  return out;
}

/** Compares two strings by Unicode code point. */
function compareCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left, (char) => char.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (char) => char.codePointAt(0) ?? 0);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    const a = leftPoints[index] ?? 0;
    const b = rightPoints[index] ?? 0;
    if (a !== b) return a < b ? -1 : 1;
  }
  return leftPoints.length === rightPoints.length
    ? 0
    : leftPoints.length < rightPoints.length
      ? -1
      : 1;
}

function encodeValue(value: CanonicalValue, seen: Set<object>): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return encodeBinary64(value);
  if (typeof value === 'string') return JSON.stringify(value);

  if (typeof value !== 'object') {
    throw new TypeError(`Value has no deterministic canonical encoding: ${typeof value}.`);
  }

  if (seen.has(value)) {
    throw new TypeError('Value has no deterministic canonical encoding: cyclic reference.');
  }
  seen.add(value);

  try {
    if (isBinary(value)) return `#b64:${encodeBase64(value.bytes)}`;

    if (Array.isArray(value)) {
      const entries = value.map((entry) => encodeValue(entry as CanonicalValue, seen));
      return `[${entries.join(',')}]`;
    }

    const record = value as { readonly [key: string]: CanonicalValue };
    const keys = Object.keys(record).sort(compareCodePoints);
    const entries = keys.map(
      (key) => `${JSON.stringify(key)}:${encodeValue(record[key] as CanonicalValue, seen)}`,
    );
    return `{${entries.join(',')}}`;
  } finally {
    seen.delete(value);
  }
}

/** Produces the canonical text for a value. */
export function canonicalText(value: CanonicalValue): string {
  return encodeValue(value, new Set<object>());
}

/** UTF-8 encoder used for hashing. */
function utf8Bytes(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return new Uint8Array(bytes);
}

/** UTF-8 bytes of the canonical text. */
export function canonicalBytes(value: CanonicalValue): Uint8Array {
  return utf8Bytes(canonicalText(value));
}

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotateRight(value: number, bits: number): number {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

/** Pure SHA-256 over the given bytes, lowercase hex. */
export function sha256Hex(bytes: Uint8Array): string {
  const bitLength = bytes.length * 8;
  const paddedLength = (((bytes.length + 9 + 63) / 64) | 0) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const lengthView = new DataView(padded.buffer, padded.byteOffset, padded.byteLength);
  lengthView.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
  lengthView.setUint32(paddedLength - 4, bitLength >>> 0, false);

  const hash = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const schedule = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      schedule[index] = lengthView.getUint32(offset + index * 4, false);
    }
    for (let index = 16; index < 64; index += 1) {
      const s0 =
        rotateRight(schedule[index - 15] ?? 0, 7) ^
        rotateRight(schedule[index - 15] ?? 0, 18) ^
        ((schedule[index - 15] ?? 0) >>> 3);
      const s1 =
        rotateRight(schedule[index - 2] ?? 0, 17) ^
        rotateRight(schedule[index - 2] ?? 0, 19) ^
        ((schedule[index - 2] ?? 0) >>> 10);
      schedule[index] = ((schedule[index - 16] ?? 0) + s0 + (schedule[index - 7] ?? 0) + s1) >>> 0;
    }

    let a = hash[0] ?? 0;
    let b = hash[1] ?? 0;
    let c = hash[2] ?? 0;
    let d = hash[3] ?? 0;
    let e = hash[4] ?? 0;
    let f = hash[5] ?? 0;
    let g = hash[6] ?? 0;
    let h = hash[7] ?? 0;

    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temp1 = (h + sum1 + choose + (SHA256_K[index] ?? 0) + (schedule[index] ?? 0)) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sum0 + majority) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    hash[0] = ((hash[0] ?? 0) + a) >>> 0;
    hash[1] = ((hash[1] ?? 0) + b) >>> 0;
    hash[2] = ((hash[2] ?? 0) + c) >>> 0;
    hash[3] = ((hash[3] ?? 0) + d) >>> 0;
    hash[4] = ((hash[4] ?? 0) + e) >>> 0;
    hash[5] = ((hash[5] ?? 0) + f) >>> 0;
    hash[6] = ((hash[6] ?? 0) + g) >>> 0;
    hash[7] = ((hash[7] ?? 0) + h) >>> 0;
  }

  let hex = '';
  for (const word of hash) hex += word.toString(16).padStart(8, '0');
  return hex;
}

/** SHA-256 of the canonical bytes for a value, lowercase hex. */
export function hashCanonical(value: CanonicalValue): string {
  return sha256Hex(canonicalBytes(value));
}
