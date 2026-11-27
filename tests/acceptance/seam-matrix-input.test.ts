// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { codes, flatInput, grayProfile, rampInput, rgbInput, rgbProfile, run } from './fixtures';

/**
 * Acceptance matrix, part 1a: the continuous-tone input gate and the
 * prepared-artwork gate (spec criteria 1 and 2). Every case drives the single
 * public seam.
 */

function binaryInput() {
  const data = new Uint8Array(64);
  for (let index = 0; index < data.length; index += 1) data[index] = index % 2 === 0 ? 0 : 255;
  return flatInput(128, 8, { data });
}

describe('spec AC1: continuous-tone input gate', () => {
  it('accepts declared 8-bit and 16-bit grayscale and RGB input', () => {
    expect(run({ input: rampInput(), profile: grayProfile() }).status).toBe('completed');
    expect(run({ input: rgbInput(), profile: rgbProfile() }).status).toBe('completed');
    const sixteen = run({
      input: {
        width: 8,
        height: 8,
        ppi: 100,
        bitDepth: 16,
        layout: 'grayscale',
        data: new Uint16Array(64).fill(32768),
      },
      profile: grayProfile(),
    });
    expect(sixteen.status).toBe('completed');
  });

  it('rejects a missing PPI and an unsupported layout with stable codes', () => {
    expect(codes(run({ input: flatInput(128, 8, { ppi: undefined as never }) }))).toEqual([
      'input.ppi_missing',
    ]);
    expect(codes(run({ input: flatInput(128, 8, { layout: 'lab' as never }) }))).toEqual([
      'input.unsupported_layout',
    ]);
  });
});

describe('spec AC2: prepared artwork', () => {
  it('rejects binary, pre-separated and pre-screened material', () => {
    expect(codes(run({ input: binaryInput() }))).toEqual(['input.prepared_artwork']);
    expect(codes(run({ input: flatInput(128, 8, { layout: 'cmyk' as never }) }))).toEqual([
      'input.prepared_artwork',
    ]);
    expect(codes(run({ input: flatInput(128, 8, { layout: 'pre-screened' as never }) }))).toEqual([
      'input.prepared_artwork',
    ]);
  });

  it('records an explicit override in the snapshot and carries a warning', () => {
    const result = run({
      input: flatInput(128, 8, {
        data: binaryInput().data,
        preparedArtworkOverride: { acknowledged: true, reason: 'customer approved rescreen' },
      }),
    });

    expect(result.status).toBe('completed');
    expect(codes(result)).toEqual(['input.prepared_artwork_override']);
    if (result.status !== 'completed') return;
    expect(result.snapshot.overrides.preparedArtwork).toEqual({
      acknowledged: true,
      reason: 'customer approved rescreen',
    });
    expect(result.issues[0]?.severity).toBe('warning');
  });

  it('never reinterprets structural prepared artwork through an override', () => {
    const result = run({
      input: flatInput(128, 8, {
        layout: 'cmyk' as never,
        preparedArtworkOverride: { acknowledged: true, reason: 'customer approved rescreen' },
      }),
    });
    expect(result.status).toBe('rejected');
    expect(codes(result)).toEqual(['input.prepared_artwork']);
  });
});
