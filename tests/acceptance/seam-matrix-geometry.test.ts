// @vitest-environment node

import { describe, expect, it } from 'vitest';

import type { CompletedResult, ScreeningResult } from '../../src/engines/halftone/contracts';
import { flatInput, grayProfile, run, toneChannel } from './fixtures';

/**
 * Acceptance matrix, part 5: cell indexing and edge handling (spec criteria 25
 * and 26).
 *
 * The structural proofs (negative indices with `alpha`/`beta` in `[0, 1)`, the
 * clipped flag and the visible/marked ratio) live in
 * `tests/unit/halftone/geometry-probes.test.ts`. This file asserts their
 * externally observable consequences through the single seam: a rotated screen
 * still marks the whole canvas, and a canvas that extends past the input
 * replicates the declared border instead of zero-filling or wrapping.
 */

function completed(result: ScreeningResult): CompletedResult {
  expect(result.status).toBe('completed');
  if (result.status !== 'completed') throw new Error('expected a completed result');
  return result;
}

function rasterOf(result: CompletedResult): { readonly width: number; readonly data: Uint8Array } {
  const raster = result.rasters[0];
  if (raster === undefined) throw new Error('expected one raster');
  return raster;
}

function rotated(angle: number) {
  return grayProfile({
    channels: [
      toneChannel({ screening: { method: 'am', frequency: 25, angle, dotShape: 'round' } }),
    ],
  });
}

describe('spec AC25: cell indexing reaches negative coordinates', () => {
  it('keeps a rotated screen covering the canvas at full tone', () => {
    for (const angle of [0, 15, 45, 75]) {
      const result = completed(run({ input: flatInput(255), profile: rotated(angle) }));
      const { width, data } = rasterOf(result);
      const unmarked: Array<[number, number]> = [];
      for (let y = 0; y < result.snapshot.canvas.height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          if (data[y * width + x] === 0) unmarked.push([x, y]);
        }
      }

      // A truncation-toward-zero bug would drop every cell reached from a
      // negative coordinate and leave whole edge regions unmarked.
      expect(unmarked.length, `angle ${String(angle)}`).toBeLessThanOrEqual(1);
      if (unmarked.length === 1) {
        // The only survivor is the exact lattice corner: every cell meeting
        // there has threshold 1, and marked is `threshold < value`.
        expect(unmarked[0], `angle ${String(angle)}`).toEqual([0, 0]);
      }
    }
  });

  it('leaves the canvas unmarked at zero tone for every angle', () => {
    for (const angle of [0, 15, 45, 75]) {
      const result = completed(run({ input: flatInput(0), profile: rotated(angle) }));
      expect(
        rasterOf(result).data.every((value) => value === 0),
        `angle ${String(angle)}`,
      ).toBe(true);
    }
  });

  it('repeats the same cell pattern at a positive offset of one period', () => {
    const result = completed(run({ input: flatInput(128), profile: rotated(0) }));
    const { width, data } = rasterOf(result);
    const height = result.snapshot.canvas.height;
    const period = Math.round(result.snapshot.lattice.pitch);
    expect(period).toBe(4);

    for (let y = 0; y + period < height; y += 1) {
      for (let x = 0; x + period < width; x += 1) {
        const pixel = data[y * width + x];
        expect(data[y * width + (x + period)], `(${String(x)},${String(y)})`).toBe(pixel);
        expect(data[(y + period) * width + x], `(${String(x)},${String(y)})`).toBe(pixel);
      }
    }
  });
});

describe('spec AC26: edge clamping beyond the input', () => {
  it('replicates the border and keeps the source mean on an extended canvas', () => {
    const data = new Uint8Array(64);
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) data[y * 8 + x] = x < 4 ? 0 : 200;
    }

    const result = completed(
      run({
        input: { width: 8, height: 8, ppi: 100, bitDepth: 8, layout: 'grayscale', data },
        dpi: 200,
      }),
    );

    expect(result.snapshot.canvas).toMatchObject({
      width: 16,
      height: 16,
      suppliedPpi: 100,
      suppliedDpi: 200,
      physicalWidth: 0.08,
      physicalHeight: 0.08,
    });
    expect(rasterOf(result).width).toBe(16);
    // Zero-filling the out-of-bounds half would halve the mean; wrapping would
    // repeat the left patch. Exact equality proves border replication.
    expect(result.channels[0]?.summaries.commanded.mean).toBe(200 / 255 / 2);
    expect(result.channels[0]?.summaries.commanded.max).toBe(200 / 255);
  });

  it('marks no output pixel outside the original tone distribution', () => {
    const result = completed(run({ input: flatInput(0), dpi: 200 }));
    expect(rasterOf(result).data.every((value) => value === 0)).toBe(true);
  });
});
