/**
 * Area-coverage sampling, spot functions, per-pixel thresholding and digital
 * addressability for the halftone engine.
 *
 * Sampling integrates a cell footprint over the edge-clamped input in input
 * space; thresholding evaluates a spot function at each output pixel centre and
 * compares it with the cell's reproducible tonal value. Both are deterministic
 * and independent of any tile decomposition: the same global lattice and the
 * same area weights produce the same result everywhere.
 *
 * The module is pure and synchronous: no host, DOM, I/O, network or randomness.
 * Geometry values stay in double precision until the final threshold decision;
 * only the output canvas dimension is rounded, and that happens in the geometry
 * module.
 */

import { createIssue, toJsonValue } from './contracts/issue';
import type { Issue } from './contracts/issue';
import { DOT_SHAPES, type DotShape, type SpotFunction } from './contracts/screening';
import type {
  AddressabilityInput,
  AddressabilityResult,
  RasterizeCellInput,
  RasterizeCellResult,
  SampleCellInput,
  SampleCellResult,
  SamplingImage,
  ScreenPixelDecision,
  SpotFunctionResult,
} from './contracts/screening';
import type { CellFootprint, Lattice, Vector2 } from './contracts/geometry';
import {
  cellFootprint,
  cellIndexRange,
  clampInputPixel,
  coverageWeights,
  enumerateVisibleFootprint,
  locateCell,
  polygonArea,
  screenFraction,
} from './geometry';

/** Declared aspect ratio of the elliptical spot function's long axis. */
const ELLIPTICAL_ASPECT = 2;

/** Normalizer that maps the elliptical corner distance to `1`. */
const ELLIPTICAL_NORM = Math.hypot(1, 1 / ELLIPTICAL_ASPECT);

/**
 * Round spot: normalized Euclidean distance from the cell centre. The level set
 * at threshold `t` is a circle of radius `t` in normalized cell coordinates.
 */
function roundThreshold(alpha: number, beta: number): number {
  return Math.hypot(2 * alpha - 1, 2 * beta - 1) / Math.SQRT2;
}

/**
 * Elliptical spot: the round distance with the vertical axis compressed by the
 * declared aspect ratio, so the dot grows as an ellipse elongated along the
 * cell's horizontal axis.
 */
function ellipticalThreshold(alpha: number, beta: number): number {
  const horizontal = 2 * alpha - 1;
  const vertical = (2 * beta - 1) / ELLIPTICAL_ASPECT;
  return Math.min(1, Math.hypot(horizontal, vertical) / ELLIPTICAL_NORM);
}

/**
 * Square spot: the Chebyshev distance from the cell centre. The level set at
 * threshold `t` is an axis-aligned square of half-side `t` in normalized cell
 * coordinates.
 */
function squareThreshold(alpha: number, beta: number): number {
  return Math.max(Math.abs(2 * alpha - 1), Math.abs(2 * beta - 1));
}

const SPOT_FUNCTIONS: Record<DotShape, SpotFunction> = {
  round: roundThreshold,
  elliptical: ellipticalThreshold,
  square: squareThreshold,
};

function invalidInput(parameter: string, message: string, offendingValue?: unknown): Issue {
  return createIssue('geometry.invalid_input', message, {
    offendingValue: offendingValue === undefined ? undefined : toJsonValue(offendingValue),
    expected: 'valid sampling or screening input',
    parameter,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

function isUnitValue(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isFiniteVector(value: unknown): value is Vector2 {
  if (!isRecord(value)) return false;
  return (
    typeof value.x === 'number' &&
    Number.isFinite(value.x) &&
    typeof value.y === 'number' &&
    Number.isFinite(value.y)
  );
}

function isFootprint(value: unknown): value is CellFootprint {
  if (!isRecord(value)) return false;
  const corners = value.corners;
  if (!Array.isArray(corners) || corners.length !== 4) return false;
  return corners.every(isFiniteVector);
}

function isSamplingImage(value: unknown): value is SamplingImage {
  if (!isRecord(value)) return false;
  const { data, width, height } = value;
  if (!isPositiveInteger(width) || !isPositiveInteger(height)) return false;
  if (!(data instanceof Float64Array)) return false;
  return data.length === width * height;
}

function isCanvasSize(value: unknown): value is { width: number; height: number } {
  if (!isRecord(value)) return false;
  return isPositiveInteger(value.width) && isPositiveInteger(value.height);
}

function isLattice(value: unknown): value is Lattice {
  if (!isRecord(value)) return false;
  const { origin, u, v } = value;
  if (!isFiniteVector(origin) || !isFiniteVector(u) || !isFiniteVector(v)) return false;
  const uu = u.x * u.x + u.y * u.y;
  const vv = v.x * v.x + v.y * v.y;
  return uu > 0 && vv > 0;
}

function centroid(corners: readonly [Vector2, Vector2, Vector2, Vector2]): Vector2 {
  return {
    x: (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4,
    y: (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4,
  };
}

/**
 * Resolves a requested dot shape to its normalized spot function.
 *
 * An unknown shape is rejected with `geometry.unknown_dot_shape`; the stage
 * never falls back to a default shape, because a silent substitution would
 * change the printed screen without telling anyone.
 */
export function createSpotFunction(shape: string): SpotFunctionResult {
  if (typeof shape !== 'string' || !(DOT_SHAPES as readonly string[]).includes(shape)) {
    return {
      status: 'rejected',
      issues: [
        createIssue('geometry.unknown_dot_shape', `Unknown dot shape: ${String(shape)}.`, {
          offendingValue: toJsonValue(shape),
          expected: DOT_SHAPES.join(', '),
          parameter: 'dotShape',
        }),
      ],
    };
  }

  const dotShape = shape as DotShape;
  return {
    status: 'accepted',
    issues: [],
    shape: dotShape,
    threshold: SPOT_FUNCTIONS[dotShape],
  };
}

/**
 * Deterministic area-coverage sampling of one cell against the edge-clamped
 * input.
 *
 * The footprint must be expressed in input space: build it with an input-space
 * lattice (`resolution = input PPI`), so the same physical cell side `1 / LPI`
 * inch is measured in input pixels and sampling is independent of output
 * resolution.
 *
 * When the footprint's pitch is smaller than one input pixel, the value of the
 * pixel containing the cell centre is used and `fallback` records it, as the
 * spec requires; exact area coverage is used otherwise. Because the coverage
 * weights partition the footprint, the returned value is the exact
 * area-weighted mean and no area is dropped or renormalised at a border.
 */
export function sampleCellValue(input: SampleCellInput): SampleCellResult {
  const issues: Issue[] = [];

  if (!isRecord(input)) {
    issues.push(invalidInput('sample', 'Sampling requires a footprint and an image.'));
    return { status: 'rejected', issues };
  }

  const image = input.image;
  if (!isSamplingImage(image)) {
    issues.push(
      invalidInput(
        'image',
        'Sampling requires a single-channel plane whose data length equals width * height.',
      ),
    );
    return { status: 'rejected', issues };
  }

  const footprint = input.footprint;
  if (!isFootprint(footprint)) {
    issues.push(invalidInput('footprint', 'A footprint requires four finite corners.'));
    return { status: 'rejected', issues };
  }

  const area = polygonArea(footprint.corners);
  if (!(area > 0) || !Number.isFinite(area)) {
    issues.push(
      invalidInput('footprint', 'The footprint must have a positive, finite area.', area),
    );
    return { status: 'rejected', issues };
  }

  const [firstCorner, secondCorner] = footprint.corners;
  const pitch = Math.hypot(secondCorner.x - firstCorner.x, secondCorner.y - firstCorner.y);

  if (pitch < 1) {
    const centre = centroid(footprint.corners);
    const pixel = clampInputPixel(centre.x, centre.y, image.width, image.height);
    const value = image.data[pixel.l * image.width + pixel.k];
    if (!isUnitValue(value)) {
      issues.push(
        invalidInput('image', 'Sampled input values must be finite and within [0, 1].', value),
      );
      return { status: 'rejected', issues };
    }
    return {
      status: 'accepted',
      issues,
      value,
      fallback: 'containing-pixel',
      weight: area,
      samples: 1,
    };
  }

  const weights = coverageWeights({
    polygon: footprint.corners,
    width: image.width,
    height: image.height,
  });
  if (weights.length === 0) {
    issues.push(invalidInput('footprint', 'The footprint does not overlap the input.'));
    return { status: 'rejected', issues };
  }

  let total = 0;
  let weighted = 0;
  for (const entry of weights) {
    const value = image.data[entry.pixel];
    if (!isUnitValue(value)) {
      issues.push(
        invalidInput('image', 'Sampled input values must be finite and within [0, 1].', value),
      );
      return { status: 'rejected', issues };
    }
    total += entry.weight;
    weighted += entry.weight * value;
  }

  if (!(total > 0)) {
    issues.push(invalidInput('footprint', 'The footprint has no measurable overlap area.'));
    return { status: 'rejected', issues };
  }

  return {
    status: 'accepted',
    issues,
    value: weighted / total,
    fallback: 'none',
    weight: total,
    samples: weights.length,
  };
}

/**
 * Thresholds one cell's visible output pixels.
 *
 * Each output pixel centre is located inside its cell, the spot function is
 * evaluated there, and the pixel is marked when the reproducible value strictly
 * exceeds the threshold. The comparison is strict on purpose: a value equal to
 * the threshold leaves the pixel unmarked, so a zero value marks nothing and
 * the boundary rule is stable and testable.
 *
 * A cell with no visible pixel lies entirely outside the canvas and is not
 * evaluated: `evaluated` is false, `fraction` is `null` and no trace entry is
 * produced.
 */
export function rasterizeCell(input: RasterizeCellInput): RasterizeCellResult {
  const issues: Issue[] = [];

  if (!isRecord(input)) {
    issues.push(
      invalidInput(
        'rasterize',
        'Rasterizing a cell requires its footprint, canvas, lattice, value and dot shape.',
      ),
    );
    return { status: 'rejected', issues };
  }

  if (!isCanvasSize(input.canvas)) {
    issues.push(
      invalidInput('canvas', 'Canvas dimensions must be positive integers.', input.canvas),
    );
    return { status: 'rejected', issues };
  }

  if (!isLattice(input.lattice)) {
    issues.push(invalidInput('lattice', 'The lattice basis must be finite and non-degenerate.'));
    return { status: 'rejected', issues };
  }

  const footprint = input.footprint;
  if (!isFootprint(footprint)) {
    issues.push(invalidInput('footprint', 'A footprint requires four finite corners.'));
    return { status: 'rejected', issues };
  }

  const area = polygonArea(footprint.corners);
  if (!(area > 0) || !Number.isFinite(area)) {
    issues.push(
      invalidInput('footprint', 'The footprint must have a positive, finite area.', area),
    );
    return { status: 'rejected', issues };
  }

  const value = input.value;
  if (!isUnitValue(value)) {
    issues.push(
      invalidInput(
        'value',
        'The reproducible tonal value must be finite and within [0, 1].',
        value,
      ),
    );
    return { status: 'rejected', issues };
  }

  const spot = createSpotFunction(input.dotShape);
  if (spot.status === 'rejected') {
    return { status: 'rejected', issues: spot.issues };
  }

  const visible = enumerateVisibleFootprint(footprint, input.canvas);
  if (visible.visible === 0) {
    return {
      status: 'accepted',
      issues,
      evaluated: false,
      clipped: visible.clipped,
      visible: 0,
      marked: 0,
      fraction: null,
      pixels: [],
    };
  }

  const pixels: ScreenPixelDecision[] = visible.pixels.map(({ k, l }) => {
    const address = locateCell({ x: k + 0.5, y: l + 0.5 }, input.lattice);
    const threshold = spot.threshold(address.alpha, address.beta);
    return { k, l, threshold, marked: value > threshold };
  });

  const marked = pixels.reduce((count, pixel) => (pixel.marked ? count + 1 : count), 0);

  return {
    status: 'accepted',
    issues,
    evaluated: true,
    clipped: visible.clipped,
    visible: visible.visible,
    marked,
    fraction: screenFraction(marked, visible.visible),
    pixels,
  };
}

/**
 * Threshold gaps at or below this bound are treated as equal.
 *
 * Two pixels that are symmetric in the cell receive mathematically equal spot
 * values, but `locateCell` reaches them through different floating-point paths,
 * so their computed thresholds can differ by a few ulps (~1e-16). Treating such
 * a gap as a real interval would fabricate a coverage that only exists inside a
 * 1e-16-wide window of the tonal value, and for a rotated cell it degenerates the
 * report to `cell pixels + 1` — the exact formula the spec forbids. The bound is
 * far below any declared tonal precision, so no reproducible coverage is lost.
 */
const THRESHOLD_TIE_TOLERANCE = 1e-12;

/**
 * The marked counts a cell can produce as the reproducible value sweeps `[0, 1]`.
 *
 * Marked is `#{threshold < value}`, so a count is reachable only when the value
 * can fall strictly between two consecutive sorted thresholds. Equal thresholds
 * therefore collapse the reachable counts: four pixels sharing one threshold
 * produce only `0` or `4` marked, never `1`, `2` or `3`. This is why
 * addressability cannot be `cell pixels + 1`.
 *
 * "Equal" here means equal within `THRESHOLD_TIE_TOLERANCE`, not bit-identical:
 * ulp-level gaps are round-off, not addressable tonal steps.
 */
function achievableCoverages(thresholds: readonly number[], visible: number): number[] {
  const sorted = [...thresholds].sort((left, right) => left - right);
  const coverages = [0];

  for (let marked = 1; marked <= visible; marked += 1) {
    const previous = sorted[marked - 1];
    if (previous === undefined || !(previous < 1 - THRESHOLD_TIE_TOLERANCE)) continue;
    if (marked < visible) {
      const next = sorted[marked];
      if (next === undefined || !(previous < next - THRESHOLD_TIE_TOLERANCE)) continue;
    }
    coverages.push(marked / visible);
  }

  return coverages;
}

/**
 * Digital addressability of a geometry and spot function.
 *
 * Only unclipped cells are enumerated. For each one the actual per-pixel
 * thresholds are computed and reduced to the coverage fractions the raster can
 * produce; the report is the union across cells. `cellPixelCount` is the
 * largest visible count observed (the nominal full cell) and is reported
 * separately, because sub-pixel placement and the spot function can make it
 * differ from the coverage count.
 */
export function computeAddressability(input: AddressabilityInput): AddressabilityResult {
  const issues: Issue[] = [];

  if (!isRecord(input)) {
    issues.push(
      invalidInput('addressability', 'Addressability requires a lattice, canvas and dot shape.'),
    );
    return { status: 'rejected', issues };
  }

  if (!isLattice(input.lattice)) {
    issues.push(invalidInput('lattice', 'The lattice basis must be finite and non-degenerate.'));
    return { status: 'rejected', issues };
  }

  if (!isCanvasSize(input.canvas)) {
    issues.push(
      invalidInput('canvas', 'Canvas dimensions must be positive integers.', input.canvas),
    );
    return { status: 'rejected', issues };
  }

  const spot = createSpotFunction(input.dotShape);
  if (spot.status === 'rejected') {
    return { status: 'rejected', issues: spot.issues };
  }

  const { lattice, canvas } = input;
  const { minI: iMin, maxI: iMax, minJ: jMin, maxJ: jMax } = cellIndexRange(lattice, canvas);

  const counts: number[] = [];
  const coverage = new Set<number>();

  for (let j = jMin; j <= jMax; j += 1) {
    for (let i = iMin; i <= iMax; i += 1) {
      const footprint = cellFootprint(i, j, lattice);
      const visible = enumerateVisibleFootprint(footprint, canvas);
      if (visible.clipped || visible.visible === 0) continue;

      const thresholds = visible.pixels.map(({ k, l }) => {
        const address = locateCell({ x: k + 0.5, y: l + 0.5 }, lattice);
        return spot.threshold(address.alpha, address.beta);
      });

      counts.push(visible.visible);
      for (const fraction of achievableCoverages(thresholds, visible.visible)) {
        coverage.add(fraction);
      }
    }
  }

  const coverages = [...coverage].sort((left, right) => left - right);
  const cellPixelCount = counts.reduce((largest, count) => Math.max(largest, count), 0);

  return {
    status: 'accepted',
    issues,
    report: {
      shape: spot.shape,
      cellPixelCount,
      cellPixelCounts: [...new Set(counts)].sort((left, right) => left - right),
      addressableCoverageCount: coverages.length,
      coverages,
      cellsEvaluated: counts.length,
    },
  };
}
