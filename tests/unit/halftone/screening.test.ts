import { describe, expect, it } from 'vitest';
import {
  DOT_SHAPES,
  ISSUE_REGISTRY,
  isRegisteredIssueCode,
  type CellFootprint,
  type DotShape,
  type Lattice,
  type LatticeResult,
  type SamplingImage,
} from '../../../src/engines/halftone/contracts';
import { cellFootprint, createLattice } from '../../../src/engines/halftone/geometry';
import {
  computeAddressability,
  createSpotFunction,
  rasterizeCell,
  sampleCellValue,
} from '../../../src/engines/halftone/screening';

const QUANTISATION_STEP = 1 / 65535;

// Declared elliptical normalizer, mirrored here so the test states the contract
// rather than reading an implementation detail.
const ELLIPTICAL_NORM = Math.hypot(1, 1 / 2);

function latticeOf(resolution: number, lpi: number, angle: number): Lattice {
  const result: LatticeResult = createLattice({ resolution, lpi, angle });
  if (result.status !== 'accepted') throw new Error('expected an accepted lattice');
  return result.lattice;
}

function imageOf(values: readonly number[], width: number, height: number): SamplingImage {
  return { data: Float64Array.from(values), width, height };
}

function footprint(i: number, j: number, lattice: Lattice): CellFootprint {
  return cellFootprint(i, j, lattice);
}

function codes(result: { readonly issues: readonly { readonly code: string }[] }): string[] {
  return result.issues.map((issue) => issue.code);
}

describe('sampling: area coverage', () => {
  it('returns the patch value for a flat patch', () => {
    const input = latticeOf(4, 2, 0); // pitch 2, input space
    const image = imageOf(new Array<number>(16).fill(0.37), 4, 4);
    const result = sampleCellValue({ footprint: footprint(-1, -1, input), image });

    expect(result.status).toBe('accepted');
    if (result.status !== 'accepted') return;
    expect(result.value).toBeCloseTo(0.37, 12);
    expect(Math.abs(result.value - 0.37)).toBeLessThanOrEqual(QUANTISATION_STEP);
    expect(result.fallback).toBe('none');
    expect(result.issues).toEqual([]);
  });

  it('returns the area-weighted value for a two-tone patch', () => {
    const input = latticeOf(4, 2, 0); // pitch 2
    const image = imageOf([0, 1, 0, 1], 2, 2); // left column 0, right column 1
    const result = sampleCellValue({ footprint: footprint(-1, -1, input), image });

    expect(result.status).toBe('accepted');
    if (result.status !== 'accepted') return;
    expect(result.value).toBeCloseTo(0.5, 12);
    expect(result.samples).toBe(4);
    expect(result.weight).toBeCloseTo(4, 12);
  });

  it('weights a footprint that crosses several input pixels by exact overlap area', () => {
    const input = latticeOf(3, 2, 0); // pitch 1.5
    const image = imageOf([0, 0.5, 0.25, 1], 2, 2);
    const result = sampleCellValue({ footprint: footprint(-1, -1, input), image });

    expect(result.status).toBe('accepted');
    if (result.status !== 'accepted') return;
    // Overlaps: 1, 0.5, 0.5, 0.25 -> (0.25 + 0.125 + 0.25) / 2.25 = 5/18.
    expect(result.value).toBeCloseTo(5 / 18, 12);
    expect(result.weight).toBeCloseTo(2.25, 12);
    expect(result.samples).toBe(4);
  });

  it('replicates border pixels when the footprint extends past an input side', () => {
    const input = latticeOf(4, 2, 0); // pitch 2
    const image = imageOf([0, 1], 2, 1); // one row, two columns
    // Cell (-1, 0) spans x in [0, 2], y in [-2, 0]; every y clamps to row 0.
    const result = sampleCellValue({ footprint: footprint(-1, 0, input), image });

    expect(result.status).toBe('accepted');
    if (result.status !== 'accepted') return;
    expect(result.value).toBeCloseTo(0.5, 12);
    expect(result.weight).toBeCloseTo(4, 12); // the full footprint area, no area dropped
  });

  it('is independent of output resolution: input space uses PPI/LPI only', () => {
    const input = latticeOf(300, 150, 15); // input pitch 2 from PPI 300
    const output = latticeOf(600, 150, 15); // output pitch 4 from DPI 600
    const image = imageOf(new Array<number>(64).fill(0.42), 8, 8);

    expect(input.pitch).toBeCloseTo(2, 12);
    expect(output.pitch).toBeCloseTo(4, 12);
    const result = sampleCellValue({ footprint: footprint(-1, -1, input), image });
    expect(result.status).toBe('accepted');
    if (result.status !== 'accepted') return;
    expect(result.value).toBeCloseTo(0.42, 12);
  });

  it('rejects a plane whose data length does not match its dimensions', () => {
    const input = latticeOf(4, 2, 0);
    const image: SamplingImage = { data: new Float64Array(3), width: 2, height: 2 };
    const result = sampleCellValue({ footprint: footprint(-1, -1, input), image });

    expect(result.status).toBe('rejected');
    expect(codes(result)).toContain('geometry.invalid_input');
  });

  it('rejects a non-finite or out-of-range sample instead of clamping it', () => {
    const input = latticeOf(4, 2, 0);
    const nonFinite = imageOf([0, Number.NaN, 0, 0], 2, 2);
    const outOfRange = imageOf([0, 1.5, 0, 0], 2, 2);

    const first = sampleCellValue({ footprint: footprint(-1, -1, input), image: nonFinite });
    const second = sampleCellValue({ footprint: footprint(-1, -1, input), image: outOfRange });

    expect(first.status).toBe('rejected');
    expect(second.status).toBe('rejected');
    expect(codes(first)).toContain('geometry.invalid_input');
    expect(codes(second)).toContain('geometry.invalid_input');
  });

  it('rejects a degenerate footprint', () => {
    const point = { x: 1, y: 1 };
    const degenerate: CellFootprint = {
      i: 0,
      j: 0,
      corners: [point, point, point, point],
    };
    const result = sampleCellValue({ footprint: degenerate, image: imageOf([0], 1, 1) });

    expect(result.status).toBe('rejected');
    expect(codes(result)).toContain('geometry.invalid_input');
  });
});

describe('sampling: sub-pixel cell fallback', () => {
  it('uses the containing pixel value and records the fallback below one input pixel', () => {
    const input = latticeOf(1, 2, 0); // pitch 0.5, smaller than one input pixel
    const values = Array.from({ length: 16 }, (_, index) => (index + 1) / 16);
    const image = imageOf(values, 4, 4);
    // Cell (-3, -3) spans [1, 1.5] x [1, 1.5]; centre (1.25, 1.25) -> pixel (1, 1).
    const result = sampleCellValue({ footprint: footprint(-3, -3, input), image });

    expect(result.status).toBe('accepted');
    if (result.status !== 'accepted') return;
    expect(result.fallback).toBe('containing-pixel');
    expect(result.value).toBe(image.data[1 * 4 + 1]);
    expect(result.samples).toBe(1);
    // Exact area coverage would average neighbours, so this proves the fallback ran.
    const first = image.data[0];
    const neighbour = image.data[5];
    if (first === undefined || neighbour === undefined) throw new Error('expected samples');
    expect(result.value).not.toBeCloseTo((first + neighbour) / 2, 6);
  });

  it('clamps the containing pixel when the cell centre lies outside the input', () => {
    const input = latticeOf(1, 2, 0); // pitch 0.5
    const values = Array.from({ length: 16 }, (_, index) => (index + 1) / 16);
    const image = imageOf(values, 4, 4);
    // Cell (1, 1) spans [-1, -0.5] x [-1, -0.5]; centre (-0.75, -0.75) clamps to (0, 0).
    const result = sampleCellValue({ footprint: footprint(1, 1, input), image });

    expect(result.status).toBe('accepted');
    if (result.status !== 'accepted') return;
    expect(result.fallback).toBe('containing-pixel');
    expect(result.value).toBe(image.data[0]);
  });
});

describe('spot functions', () => {
  it('normalizes every declared shape to [0, 1] with zero at the cell centre', () => {
    for (const shape of DOT_SHAPES) {
      const spot = createSpotFunction(shape);
      expect(spot.status).toBe('accepted');
      if (spot.status !== 'accepted') continue;

      expect(spot.shape).toBe(shape);
      expect(spot.issues).toEqual([]);
      expect(spot.threshold(0.5, 0.5)).toBe(0);

      for (let alpha = 0; alpha < 1; alpha += 0.1) {
        for (let beta = 0; beta < 1; beta += 0.1) {
          const threshold = spot.threshold(alpha, beta);
          expect(Number.isFinite(threshold)).toBe(true);
          expect(threshold).toBeGreaterThanOrEqual(0);
          expect(threshold).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('gives each shape a distinct threshold profile', () => {
    const round = createSpotFunction('round');
    const elliptical = createSpotFunction('elliptical');
    const square = createSpotFunction('square');
    if (
      round.status !== 'accepted' ||
      elliptical.status !== 'accepted' ||
      square.status !== 'accepted'
    ) {
      throw new Error('expected accepted spot functions');
    }

    // Edge midpoint: square reaches the boundary (1), round does not, and the
    // elliptical dot is stretched horizontally so it differs on both axes.
    expect(square.threshold(0, 0.5)).toBe(1);
    expect(round.threshold(0, 0.5)).toBeCloseTo(1 / Math.SQRT2, 12);
    expect(elliptical.threshold(0, 0.5)).toBeCloseTo(1 / ELLIPTICAL_NORM, 12);
    expect(elliptical.threshold(0.5, 0)).toBeCloseTo(0.5 / ELLIPTICAL_NORM, 12);
    expect(elliptical.threshold(0, 0.5)).not.toBeCloseTo(elliptical.threshold(0.5, 0), 12);
  });

  it('rejects an unknown shape with the registered stable code', () => {
    for (const shape of ['triangle', 'ROUND', '', 'diamond']) {
      const result = createSpotFunction(shape);
      expect(result.status).toBe('rejected');
      expect(codes(result)).toEqual(['geometry.unknown_dot_shape']);
      expect(ISSUE_REGISTRY['geometry.unknown_dot_shape']).toEqual({
        severity: 'error',
        scope: 'geometry',
      });
    }
  });
});

describe('thresholding: per-pixel decisions', () => {
  const output = latticeOf(4, 2, 0); // pitch 2 in output space
  const canvas = { width: 2, height: 2 };
  const cell = footprint(-1, -1, output); // spans [0, 2] x [0, 2]

  it('marks only when the value strictly exceeds the threshold', () => {
    const atThreshold = rasterizeCell({
      footprint: cell,
      canvas,
      lattice: output,
      value: 0.5,
      dotShape: 'square',
    });
    const aboveThreshold = rasterizeCell({
      footprint: cell,
      canvas,
      lattice: output,
      value: 0.5 + 1e-9,
      dotShape: 'square',
    });

    expect(atThreshold.status).toBe('accepted');
    expect(aboveThreshold.status).toBe('accepted');
    if (atThreshold.status !== 'accepted' || aboveThreshold.status !== 'accepted') return;

    // Every pixel centre in a pitch-2 cell has |2a-1| = 0.5 for square.
    expect(atThreshold.pixels.every((pixel) => pixel.threshold === 0.5)).toBe(true);
    expect(atThreshold.marked).toBe(0);
    expect(atThreshold.fraction).toBe(0);
    expect(aboveThreshold.marked).toBe(4);
    expect(aboveThreshold.fraction).toBe(1);
  });

  it('marks nothing at value 0 and everything at value 1 for each shape', () => {
    for (const shape of DOT_SHAPES) {
      const zero = rasterizeCell({
        footprint: cell,
        canvas,
        lattice: output,
        value: 0,
        dotShape: shape,
      });
      const one = rasterizeCell({
        footprint: cell,
        canvas,
        lattice: output,
        value: 1,
        dotShape: shape,
      });

      expect(zero.status).toBe('accepted');
      expect(one.status).toBe('accepted');
      if (zero.status !== 'accepted' || one.status !== 'accepted') continue;
      expect(zero.marked).toBe(0);
      expect(one.marked).toBe(one.visible);
      expect(one.fraction).toBe(1);
    }
  });

  it('reports marked over visible for a clipped cell', () => {
    // Cell (-2, -1) spans x in [2, 4], y in [0, 2]; the canvas cuts it at x = 3.
    const clipped = rasterizeCell({
      footprint: footprint(-2, -1, output),
      canvas: { width: 3, height: 3 },
      lattice: output,
      value: 1,
      dotShape: 'square',
    });

    expect(clipped.status).toBe('accepted');
    if (clipped.status !== 'accepted') return;
    expect(clipped.clipped).toBe(true);
    expect(clipped.visible).toBe(2);
    expect(clipped.marked).toBe(2);
    expect(clipped.fraction).toBe(1);
  });

  it('does not evaluate a cell with no visible pixel', () => {
    const outside = rasterizeCell({
      footprint: footprint(1, 1, output), // spans [-2, 0] x [-2, 0]
      canvas,
      lattice: output,
      value: 0.5,
      dotShape: 'round',
    });

    expect(outside.status).toBe('accepted');
    if (outside.status !== 'accepted') return;
    expect(outside.evaluated).toBe(false);
    expect(outside.visible).toBe(0);
    expect(outside.fraction).toBeNull();
    expect(outside.pixels).toEqual([]);
  });

  it('rejects an out-of-range or non-finite reproducible value', () => {
    for (const value of [-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = rasterizeCell({
        footprint: cell,
        canvas,
        lattice: output,
        value,
        dotShape: 'round',
      });
      expect(result.status).toBe('rejected');
      expect(codes(result)).toContain('geometry.invalid_input');
    }
  });

  it('rejects an invalid canvas and an unknown shape', () => {
    const badCanvas = rasterizeCell({
      footprint: cell,
      canvas: { width: 0, height: 2 },
      lattice: output,
      value: 0.5,
      dotShape: 'round',
    });
    const badShape = rasterizeCell({
      footprint: cell,
      canvas,
      lattice: output,
      value: 0.5,
      dotShape: 'triangle',
    });

    expect(badCanvas.status).toBe('rejected');
    expect(codes(badCanvas)).toContain('geometry.invalid_input');
    expect(badShape.status).toBe('rejected');
    expect(codes(badShape)).toEqual(['geometry.unknown_dot_shape']);
  });
});

describe('thresholding: monotonic dot growth', () => {
  const output = latticeOf(4, 1, 0); // pitch 4 in output space
  const canvas = { width: 8, height: 8 };
  const cell = footprint(-1, -1, output); // spans [0, 4] x [0, 4], 16 pixels

  it('never decreases the marked area as the reproducible value grows', () => {
    for (const shape of DOT_SHAPES as readonly DotShape[]) {
      let previous = 0;
      let sawIncrease = false;

      for (let value = 0; value <= 1.0000001; value += 0.02) {
        const result = rasterizeCell({
          footprint: cell,
          canvas,
          lattice: output,
          value: Math.min(1, value),
          dotShape: shape,
        });
        expect(result.status).toBe('accepted');
        if (result.status !== 'accepted') return;

        expect(result.marked).toBeGreaterThanOrEqual(previous);
        if (result.marked > previous) sawIncrease = true;
        previous = result.marked;
      }

      expect(sawIncrease).toBe(true);
      expect(previous).toBe(16);
    }
  });
});

describe('addressability: derived from actual thresholding', () => {
  it('collapses tied thresholds instead of using cell pixels + 1', () => {
    const output = latticeOf(2, 1, 0); // pitch 2
    const result = computeAddressability({
      lattice: output,
      canvas: { width: 2, height: 2 },
      dotShape: 'round',
    });

    expect(result.status).toBe('accepted');
    if (result.status !== 'accepted') return;
    const { report } = result;
    // Four pixel centres share one round threshold (all |2a-1| = 0.5), so only
    // 0 or 4 can be marked: two digital coverages, not 4 + 1.
    expect(report.cellPixelCount).toBe(4);
    expect(report.cellPixelCounts).toEqual([4]);
    expect(report.addressableCoverageCount).toBe(2);
    expect(report.coverages).toEqual([0, 1]);
    expect(report.cellsEvaluated).toBe(1);
  });

  it('reports cell_pixel_count and addressable_coverage_count separately', () => {
    const output = latticeOf(3, 1, 0); // pitch 3
    const result = computeAddressability({
      lattice: output,
      canvas: { width: 3, height: 3 },
      dotShape: 'round',
    });

    expect(result.status).toBe('accepted');
    if (result.status !== 'accepted') return;
    const { report } = result;
    expect(report.cellPixelCount).toBe(9);
    expect(report.cellPixelCounts).toEqual([9]);
    expect(report.addressableCoverageCount).toBe(4);
    expect(report.coverages).toEqual([0, 1 / 9, 5 / 9, 1]);
    expect(report.addressableCoverageCount).not.toBe(report.cellPixelCount + 1);
  });

  it('changes with the geometry', () => {
    const two = computeAddressability({
      lattice: latticeOf(2, 1, 0),
      canvas: { width: 2, height: 2 },
      dotShape: 'round',
    });
    const three = computeAddressability({
      lattice: latticeOf(3, 1, 0),
      canvas: { width: 3, height: 3 },
      dotShape: 'round',
    });

    if (two.status !== 'accepted' || three.status !== 'accepted') {
      throw new Error('expected accepted addressability');
    }
    expect(two.report.addressableCoverageCount).not.toBe(three.report.addressableCoverageCount);
  });

  it('changes with the spot function at a fixed geometry', () => {
    const output = latticeOf(3, 1, 0);
    const canvas = { width: 3, height: 3 };
    const round = computeAddressability({ lattice: output, canvas, dotShape: 'round' });
    const square = computeAddressability({ lattice: output, canvas, dotShape: 'square' });

    if (round.status !== 'accepted' || square.status !== 'accepted') {
      throw new Error('expected accepted addressability');
    }
    expect(round.report.addressableCoverageCount).toBe(4);
    expect(square.report.addressableCoverageCount).toBe(3);
    expect(square.report.coverages).toEqual([0, 1 / 9, 1]);
    expect(square.report.cellPixelCount).toBe(9);
  });

  it('reports sorted, unique coverages inside [0, 1]', () => {
    const result = computeAddressability({
      lattice: latticeOf(6, 1, 15),
      canvas: { width: 12, height: 12 },
      dotShape: 'elliptical',
    });

    expect(result.status).toBe('accepted');
    if (result.status !== 'accepted') return;
    const { coverages } = result.report;
    expect(new Set(coverages).size).toBe(coverages.length);
    expect([...coverages].sort((left, right) => left - right)).toEqual(coverages);
    for (const coverage of coverages) {
      expect(coverage).toBeGreaterThanOrEqual(0);
      expect(coverage).toBeLessThanOrEqual(1);
    }
    expect(result.report.addressableCoverageCount).toBe(coverages.length);
  });

  it('rejects an unknown shape and an invalid canvas', () => {
    const badShape = computeAddressability({
      lattice: latticeOf(2, 1, 0),
      canvas: { width: 2, height: 2 },
      dotShape: 'hexagon',
    });
    const badCanvas = computeAddressability({
      lattice: latticeOf(2, 1, 0),
      canvas: { width: -2, height: 2 },
      dotShape: 'round',
    });

    expect(badShape.status).toBe('rejected');
    expect(codes(badShape)).toEqual(['geometry.unknown_dot_shape']);
    expect(badCanvas.status).toBe('rejected');
    expect(codes(badCanvas)).toContain('geometry.invalid_input');
  });
});

describe('issue contract', () => {
  it('emits only centrally registered error codes in scope geometry', () => {
    const emitted = [
      ...createSpotFunction('octagon').issues,
      ...rasterizeCell({
        footprint: footprint(-1, -1, latticeOf(4, 2, 0)),
        canvas: { width: 2, height: 2 },
        lattice: latticeOf(4, 2, 0),
        value: 2,
        dotShape: 'round',
      }).issues,
      ...sampleCellValue({
        footprint: footprint(-1, -1, latticeOf(4, 2, 0)),
        image: { data: new Float64Array(1), width: 2, height: 2 },
      }).issues,
    ];

    expect(emitted.length).toBeGreaterThan(0);
    for (const issue of emitted) {
      expect(isRegisteredIssueCode(issue.code)).toBe(true);
      expect(issue.severity).toBe('error');
      expect(issue.scope).toBe('geometry');
    }
  });
});
