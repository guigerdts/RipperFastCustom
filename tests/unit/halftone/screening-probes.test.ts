/**
 * Independent verification probes for the screening stage, adopted as durable
 * regression tests after the Ticket 07 review.
 *
 * They were written by a separate read-only reviewer against the public
 * contract, and each one re-derives its expected result instead of restating
 * the implementation, so a regression in sampling, thresholding or
 * addressability fails here even when the main suite keeps passing.
 */
import { describe, expect, it } from 'vitest';
import {
  ISSUE_REGISTRY,
  type CellFootprint,
  type Lattice,
  type SamplingImage,
} from '../../../src/engines/halftone/contracts';
import { cellFootprint, createLattice } from '../../../src/engines/halftone/geometry';
import {
  computeAddressability,
  createSpotFunction,
  rasterizeCell,
  sampleCellValue,
} from '../../../src/engines/halftone/screening';

function latticeOf(resolution: number, lpi: number, angle: number): Lattice {
  const result = createLattice({ resolution, lpi, angle });
  if (result.status !== 'accepted') throw new Error('expected an accepted lattice');
  return result.lattice;
}

function rampImage(width: number, height: number, seed: number): SamplingImage {
  const data = new Float64Array(width * height);
  for (let l = 0; l < height; l += 1) {
    for (let k = 0; k < width; k += 1) {
      data[l * width + k] = (Math.sin((k + 1) * (l + 2) * 0.37 + seed) * 0.5 + 0.5) * 0.9 + 0.05;
    }
  }
  return { data, width, height };
}

function quadratureValue(footprint: CellFootprint, image: SamplingImage, n: number): number {
  const [p00, p10, , p01] = footprint.corners;
  let sum = 0;
  for (let a = 0; a < n; a += 1) {
    for (let b = 0; b < n; b += 1) {
      const alpha = (a + 0.5) / n;
      const beta = (b + 0.5) / n;
      const x = p00.x + alpha * (p10.x - p00.x) + beta * (p01.x - p00.x);
      const y = p00.y + alpha * (p10.y - p00.y) + beta * (p01.y - p00.y);
      const k = Math.min(image.width - 1, Math.max(0, Math.floor(x)));
      const l = Math.min(image.height - 1, Math.max(0, Math.floor(y)));
      sum += image.data[l * image.width + k] ?? 0;
    }
  }
  return sum / (n * n);
}

// Marked/visible fractions producible on the declared 16-bit tonal grid (spec §6),
// using the thresholds the actual rasterizer computes for one cell.
function producibleCoverages(
  footprint: CellFootprint,
  grid: Lattice,
  canvas: { width: number; height: number },
  shape: string,
): number[] {
  const atOne = rasterizeCell({ footprint, canvas, lattice: grid, value: 1, dotShape: shape });
  if (atOne.status !== 'accepted') throw new Error('expected an accepted rasterization');
  const thresholds = atOne.pixels.map((pixel) => pixel.threshold);
  const fractions = new Set<number>([0]);
  for (let q = 0; q <= 65535; q += 1) {
    const value = q / 65535;
    fractions.add(thresholds.filter((threshold) => threshold < value).length / atOne.visible);
  }
  return [...fractions].sort((left, right) => left - right);
}

describe('screening probes', () => {
  it('AC1/AC3: a flat patch is unchanged under rotation and across the input border', () => {
    const input = latticeOf(4, 1.5, 30);
    const image = { data: new Float64Array(64).fill(0.42), width: 8, height: 8 };
    for (const [i, j] of [
      [-2, -1],
      [0, 0],
    ] as const) {
      const result = sampleCellValue({ footprint: cellFootprint(i, j, input), image });
      expect(result.status).toBe('accepted');
      if (result.status !== 'accepted') return;
      expect(result.value).toBeCloseTo(0.42, 12);
      expect(result.weight).toBeCloseTo(input.pitch ** 2, 9);
    }
  });

  it('AC2: sampling matches independent dense quadrature on a rotated footprint', () => {
    const input = latticeOf(4, 1.5, 30);
    const image = rampImage(8, 8, 1);
    const footprint = cellFootprint(-2, -1, input);
    const result = sampleCellValue({ footprint, image });
    expect(result.status).toBe('accepted');
    if (result.status !== 'accepted') return;
    expect(result.fallback).toBe('none');
    expect(Math.abs(result.value - quadratureValue(footprint, image, 800))).toBeLessThan(3e-3);
  });

  it('AC3: the containing-pixel fallback applies only strictly below one input pixel', () => {
    const image = { data: Float64Array.from([0.1, 0.9, 0.2, 0.8]), width: 2, height: 2 };
    const cases: readonly (readonly [number, 'none' | 'containing-pixel'])[] = [
      [2, 'containing-pixel'],
      [1, 'none'],
      [0.999, 'none'],
    ];
    for (const [lpi, fallback] of cases) {
      const result = sampleCellValue({
        footprint: cellFootprint(-1, -1, latticeOf(1, lpi, 0)),
        image,
      });
      expect(result.status).toBe('accepted');
      if (result.status !== 'accepted') continue;
      expect(result.fallback).toBe(fallback);
    }
  });

  it('AC6 boundary: a value equal to the threshold leaves the pixel unmarked', () => {
    const output = latticeOf(4, 2, 0);
    const canvas = { width: 2, height: 2 };
    const footprint = cellFootprint(-1, -1, output);
    for (const shape of ['round', 'elliptical', 'square'] as const) {
      const at = rasterizeCell({ footprint, canvas, lattice: output, value: 0.5, dotShape: shape });
      const above = rasterizeCell({
        footprint,
        canvas,
        lattice: output,
        value: 0.5 + 1e-12,
        dotShape: shape,
      });
      expect(at.status).toBe('accepted');
      expect(above.status).toBe('accepted');
      if (at.status !== 'accepted' || above.status !== 'accepted') continue;
      expect(at.marked).toBe(0);
      expect(above.marked).toBe(4);
    }
  });

  it('AC4: the marked count never decreases across a rotated sweep for every shape', () => {
    const output = latticeOf(5, 1, 17);
    const canvas = { width: 10, height: 10 };
    const footprint = cellFootprint(-2, -1, output);
    for (const shape of ['round', 'elliptical', 'square'] as const) {
      let previous = 0;
      for (let step = 0; step <= 100; step += 1) {
        const result = rasterizeCell({
          footprint,
          canvas,
          lattice: output,
          value: step / 100,
          dotShape: shape,
        });
        expect(result.status).toBe('accepted');
        if (result.status !== 'accepted') return;
        expect(result.marked).toBeGreaterThanOrEqual(previous);
        previous = result.marked;
      }
    }
  });

  it('AC6/AC7: congruent integer-pitch addressability equals the 16-bit producible set and is canvas invariant', () => {
    const cases: readonly (readonly [number, string, number[]])[] = [
      [2, 'round', [0, 1]],
      [3, 'round', [0, 1 / 9, 5 / 9, 1]],
      [4, 'round', [0, 1 / 4, 3 / 4, 1]],
      [6, 'round', [0, 1 / 9, 1 / 3, 4 / 9, 2 / 3, 8 / 9, 1]],
    ];
    for (const [size, shape, expected] of cases) {
      const grid = latticeOf(size, 1, 0);
      const small = computeAddressability({
        lattice: grid,
        canvas: { width: size, height: size },
        dotShape: shape,
      });
      const large = computeAddressability({
        lattice: grid,
        canvas: { width: size * 5, height: size * 5 },
        dotShape: shape,
      });
      expect(small.status).toBe('accepted');
      expect(large.status).toBe('accepted');
      if (small.status !== 'accepted' || large.status !== 'accepted') continue;
      expect(small.report.coverages).toEqual(
        producibleCoverages(
          cellFootprint(-1, -1, grid),
          grid,
          { width: size, height: size },
          shape,
        ),
      );
      expect(small.report.coverages).toEqual(expected);
      expect(large.report.coverages).toEqual(small.report.coverages);
    }
  });

  it('AC8: cellPixelCount is reported separately from addressableCoverageCount', () => {
    const report = computeAddressability({
      lattice: latticeOf(4, 1, 0),
      canvas: { width: 4, height: 4 },
      dotShape: 'round',
    });
    expect(report.status).toBe('accepted');
    if (report.status !== 'accepted') return;
    expect(report.report.cellPixelCount).toBe(16);
    expect(report.report.addressableCoverageCount).toBe(4);
    expect(report.report.addressableCoverageCount).not.toBe(report.report.cellPixelCount + 1);
  });

  it('AC5/AC9: an unknown shape is rejected with the registered geometry code only', () => {
    const unknown = createSpotFunction('triangle');
    expect(unknown.status).toBe('rejected');
    expect(unknown.issues.map((issue) => issue.code)).toEqual(['geometry.unknown_dot_shape']);
    expect(ISSUE_REGISTRY['geometry.unknown_dot_shape']).toEqual({
      severity: 'error',
      scope: 'geometry',
    });
  });

  it('does not fabricate a coverage from a ulp-level threshold tie (rotated cell)', () => {
    // Regression pin for the tolerance in `achievableCoverages`: two symmetric
    // pixels of a 30-degree cell receive mathematically equal spot values, but
    // their computed thresholds differ by ~2e-16. Treating that gap as real
    // reported 38 coverages for a 37-pixel cell -- `cell pixels + 1`.
    const report = computeAddressability({
      lattice: latticeOf(6, 1, 30),
      canvas: { width: 12, height: 12 },
      dotShape: 'round',
    });
    expect(report.status).toBe('accepted');
    if (report.status !== 'accepted') return;
    expect(report.report.cellPixelCount).toBe(37);
    expect(report.report.addressableCoverageCount).toBe(37);
  });

  it('purity: frozen inputs are accepted and the image buffer survives a rejection unchanged', () => {
    const grid = latticeOf(4, 1.5, 30);
    const image = rampImage(8, 8, 3);
    const before = Array.from(image.data);
    const footprint = cellFootprint(-2, -1, grid);
    const frozenCell = Object.freeze({
      i: footprint.i,
      j: footprint.j,
      corners: Object.freeze(footprint.corners.map((corner) => Object.freeze({ ...corner }))),
    }) as unknown as CellFootprint;
    const frozenLattice = Object.freeze({
      ...grid,
      origin: Object.freeze({ ...grid.origin }),
      u: Object.freeze({ ...grid.u }),
      v: Object.freeze({ ...grid.v }),
    });
    const canvas = Object.freeze({ width: 8, height: 8 });
    expect(
      sampleCellValue({
        footprint: frozenCell,
        image: Object.freeze({ data: image.data, width: 8, height: 8 }),
      }).status,
    ).toBe('accepted');
    expect(
      rasterizeCell({
        footprint: frozenCell,
        canvas,
        lattice: frozenLattice,
        value: 0.5,
        dotShape: 'round',
      }).status,
    ).toBe('accepted');
    expect(
      computeAddressability({ lattice: frozenLattice, canvas, dotShape: 'square' }).status,
    ).toBe('accepted');
    expect(Array.from(image.data)).toEqual(before);
    expect(
      sampleCellValue({ footprint, image: { data: image.data, width: 3, height: 4 } }).status,
    ).toBe('rejected');
    expect(Array.from(image.data)).toEqual(before);
  });
});
