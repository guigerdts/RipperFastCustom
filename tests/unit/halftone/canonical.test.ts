import { describe, expect, it } from 'vitest';

import {
  canonicalBytes,
  canonicalText,
  encodeBase64,
  encodeBinary64,
  hashCanonical,
  sha256Hex,
  binary,
} from '../../../src/engines/halftone/canonical';

describe('encodeBinary64', () => {
  it('encodes the exact IEEE-754 binary64 bit pattern as 0x plus 16 lowercase hex digits', () => {
    expect(encodeBinary64(1)).toBe('0x3ff0000000000000');
    expect(encodeBinary64(0.5)).toBe('0x3fe0000000000000');
    expect(encodeBinary64(0)).toBe('0x0000000000000000');
    expect(encodeBinary64(-0)).toBe('0x8000000000000000');
    expect(encodeBinary64(1 / 3)).toBe('0x3fd5555555555555');
  });

  it('distinguishes values that print identically but differ in bits', () => {
    expect(encodeBinary64(0)).not.toBe(encodeBinary64(-0));
    expect(encodeBinary64(0.1 + 0.2)).not.toBe(encodeBinary64(0.3));
  });

  it('encodes non-finite values rather than collapsing them', () => {
    expect(encodeBinary64(Number.POSITIVE_INFINITY)).toBe('0x7ff0000000000000');
    expect(encodeBinary64(Number.NEGATIVE_INFINITY)).toBe('0xfff0000000000000');
    expect(encodeBinary64(Number.NaN)).toBe('0x7ff8000000000000');
  });
});

describe('encodeBase64', () => {
  it('uses standard base64 without line breaks', () => {
    expect(encodeBase64(new Uint8Array([]))).toBe('');
    expect(encodeBase64(new Uint8Array([0, 0, 0]))).toBe('AAAA');
    expect(encodeBase64(new Uint8Array([0xff, 0xfe, 0xfd]))).toBe('//79');
    expect(encodeBase64(new Uint8Array([0xfb, 0xff]))).toBe('+/8=');
    expect(encodeBase64(new Uint8Array([0x4d, 0x61, 0x6e]))).toBe('TWFu');
  });

  it('stays injective, so distinct payloads never share a canonical token', () => {
    // Folding case would collapse these two: base64 is case-sensitive.
    expect(encodeBase64(new Uint8Array([0x00]))).toBe('AA==');
    expect(encodeBase64(new Uint8Array([0x68]))).toBe('aA==');
    expect(canonicalText(binary(new Uint8Array([0x00])))).not.toBe(
      canonicalText(binary(new Uint8Array([0x68]))),
    );
    expect(hashCanonical(binary(new Uint8Array([0x00])))).not.toBe(
      hashCanonical(binary(new Uint8Array([0x68]))),
    );
  });

  it('round-trips arbitrary payloads through the decoder', () => {
    const payload = new Uint8Array(256);
    for (let index = 0; index < payload.length; index += 1) payload[index] = index;
    const decoded = Uint8Array.from(Buffer.from(encodeBase64(payload), 'base64'));
    expect(decoded).toEqual(payload);
  });
});

describe('canonicalText', () => {
  it('sorts keys by Unicode code point, not by UTF-16 code unit', () => {
    const astral = '\u{10000}';
    const bmp = '\u{e000}';
    const text = canonicalText({ [bmp]: 1, [astral]: 2 });
    // U+E000 < U+10000 by code point, even though its UTF-16 unit is larger.
    expect(text.indexOf(JSON.stringify(bmp))).toBeLessThan(text.indexOf(JSON.stringify(astral)));
  });

  it('is independent of insertion order', () => {
    const a = canonicalText({ b: 2, a: 1, c: { z: true, y: null } });
    const b = canonicalText({ c: { y: null, z: true }, a: 1, b: 2 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":0x3ff0000000000000,"b":0x4000000000000000,"c":{"y":null,"z":true}}');
  });

  it('encodes numbers as bare 0x tokens so strings cannot be confused with numbers', () => {
    expect(canonicalText(2)).toBe('0x4000000000000000');
    expect(canonicalText('0x4000000000000000')).toBe('"0x4000000000000000"');
  });

  it('encodes binary payloads with an unambiguous prefix', () => {
    expect(canonicalText(binary(new Uint8Array([1, 2, 3])))).toBe('#b64:AQID');
  });

  it('preserves array order and emits no insignificant whitespace', () => {
    expect(canonicalText([3, 1, 2])).toBe(
      '[0x4008000000000000,0x3ff0000000000000,0x4000000000000000]',
    );
    expect(canonicalText({ a: [1, { b: 2 }] })).toBe(
      '{"a":[0x3ff0000000000000,{"b":0x4000000000000000}]}',
    );
  });

  it('rejects values that have no deterministic encoding', () => {
    expect(() => canonicalText(undefined as never)).toThrow(TypeError);
    expect(() => canonicalText((() => 1) as never)).toThrow(TypeError);
    expect(() => canonicalText(Symbol('x') as never)).toThrow(TypeError);
  });
});

describe('canonicalBytes', () => {
  it('is the UTF-8 encoding of the canonical text', () => {
    const bytes = canonicalBytes({ name: 'ñandú' });
    expect(new TextDecoder().decode(bytes)).toBe(canonicalText({ name: 'ñandú' }));
  });
});

describe('sha256Hex', () => {
  it('matches the published vectors', () => {
    expect(sha256Hex(new Uint8Array([]))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(sha256Hex(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(
      sha256Hex(
        new TextEncoder().encode('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'),
      ),
    ).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });

  it('hashes long input across block boundaries', () => {
    const million = new Uint8Array(1_000_000).fill(0x61);
    expect(sha256Hex(million)).toBe(
      'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0',
    );
  });
});

describe('hashCanonical', () => {
  it('pins one canonical byte sequence and its hash', () => {
    const value = {
      canonicalisation: '1',
      dotShape: 'round',
      frequency: 60,
      addressability: { cellPixelCount: 9, addressableCoverageCount: 4 },
    };
    const text =
      '{"addressability":{"addressableCoverageCount":0x4010000000000000,' +
      '"cellPixelCount":0x4022000000000000},"canonicalisation":"1",' +
      '"dotShape":"round","frequency":0x404e000000000000}';
    expect(canonicalText(value)).toBe(text);
    expect(sha256Hex(new TextEncoder().encode(text))).toBe(hashCanonical(value));
  });
});
