/**
 * AM geometry for the halftone engine.
 *
 * This stage fixes the geometry contract shared by sampling and thresholding
 * (ticket 07): the global lattice, floor-based cell indexing, the rounded
 * output canvas, the edge-clamp input extension, exact area-coverage weights
 * and the clipped-footprint semantics. It computes geometry only — sampling
 * values, thresholding, dot shapes, addressability and rasterization are out of
 * scope.
 *
 * The module is pure and synchronous: no host, DOM, I/O, network or randomness.
 * All geometry is computed in double precision and no intermediate value is
 * rounded; the only integer rounding is the output canvas dimension, with
 * `round-half-up(x) = floor(x + 0.5)`.
 */

import { createIssue, resolveOutcomeStatus, toJsonValue } from './contracts/issue';
import type { Issue } from './contracts/issue';
import {
  LATTICE_ORIGIN,
  LATTICE_PHASE,
  type CanvasDimensions,
  type CanvasInput,
  type CanvasResult,
  type CellAddress,
  type CellFootprint,
  type CoverageInput,
  type CoverageWeight,
  type Lattice,
  type LatticeInput,
  type LatticeResult,
  type Vector2,
  type VisibleFootprint,
} from './contracts/geometry';

const DEGREES_TO_RADIANS = Math.PI / 180;

/**
 * Collapses `-0` to `0`. A geometry basis is data other code compares and
 * serialises, so a signed zero would leak a meaningless distinction (`-0` and
 * `0` are equal with `===` but differ under `Object.is` and in deep equality).
 */
function normalizeZero(value: number): number {
  return value === 0 ? 0 : value;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function invalidInput(parameter: string, message: string, offendingValue?: unknown): Issue {
  return createIssue('geometry.invalid_input', message, {
    offendingValue: offendingValue === undefined ? undefined : toJsonValue(offendingValue),
    expected: 'finite, positive geometry parameters',
    parameter,
  });
}

/** The declared rounding rule for the output canvas dimension. */
export function roundHalfUp(value: number): number {
  return Math.floor(value + 0.5);
}

/**
 * Builds a global AM lattice. `resolution` is the output DPI for output space
 * or the input PPI for input space; the physical cell side is `1 / lpi` inch in
 * either case, so sampling is independent of output resolution.
 *
 * The origin and phase are the declared global constants (canvas origin, phase
 * 0), so two lattices built from the same parameters are identical and no tile
 * boundary can re-anchor the lattice.
 */
export function createLattice(input: LatticeInput): LatticeResult {
  const issues: Issue[] = [];
  const raw = asRecord(input);

  if (raw === undefined) {
    issues.push(invalidInput('lattice', 'A lattice requires resolution, lpi and angle.'));
    return { status: 'rejected', issues };
  }

  if (!isPositiveFinite(raw.resolution)) {
    issues.push(
      invalidInput('resolution', 'Lattice resolution must be finite and positive.', raw.resolution),
    );
  }
  if (!isPositiveFinite(raw.lpi)) {
    issues.push(invalidInput('lpi', 'LPI must be finite and positive.', raw.lpi));
  }
  if (typeof raw.angle !== 'number' || !Number.isFinite(raw.angle)) {
    issues.push(invalidInput('angle', 'Angle must be finite.', raw.angle));
  }

  if (resolveOutcomeStatus(issues) === 'rejected') {
    return { status: 'rejected', issues };
  }

  const resolution = raw.resolution as number;
  const lpi = raw.lpi as number;
  const angle = raw.angle as number;
  const pitch = resolution / lpi;

  if (!Number.isFinite(pitch) || pitch <= 0) {
    issues.push(invalidInput('pitch', 'The cell pitch must be finite and positive.', pitch));
    return { status: 'rejected', issues };
  }

  const radians = angle * DEGREES_TO_RADIANS;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  // u points 9 o'clock rotated clockwise by the angle; v is u rotated 90
  // degrees clockwise. Both have length `pitch`.
  const u: Vector2 = { x: normalizeZero(-pitch * cos), y: normalizeZero(-pitch * sin) };
  const v: Vector2 = { x: normalizeZero(pitch * sin), y: normalizeZero(-pitch * cos) };

  return {
    status: 'accepted',
    issues,
    lattice: {
      resolution,
      lpi,
      angle,
      pitch,
      origin: LATTICE_ORIGIN,
      phase: LATTICE_PHASE,
      u,
      v,
    },
  };
}

/**
 * Locates a point's cell and in-cell fractions with `floor` on the inverse-basis
 * coordinates. `floor`, not truncation, keeps `alpha` and `beta` in `[0, 1)` for
 * negative coordinates. Requires a lattice from {@link createLattice}.
 */
export function locateCell(point: Vector2, lattice: Lattice): CellAddress {
  const dx = point.x - lattice.origin.x - lattice.phase.x;
  const dy = point.y - lattice.origin.y - lattice.phase.y;
  const uu = lattice.u.x * lattice.u.x + lattice.u.y * lattice.u.y;
  const vv = lattice.v.x * lattice.v.x + lattice.v.y * lattice.v.y;

  if (!(uu > 0) || !(vv > 0)) {
    return { i: 0, j: 0, alpha: 0, beta: 0 };
  }

  const a = (dx * lattice.u.x + dy * lattice.u.y) / uu;
  const b = (dx * lattice.v.x + dy * lattice.v.y) / vv;
  const i = Math.floor(a);
  const j = Math.floor(b);
  return { i, j, alpha: a - i, beta: b - j };
}

/**
 * Returns the four corners of cell `(i, j)` in the lattice's space. The corners
 * follow `origin + (i + di) * u + (j + dj) * v` for `(di, dj)` in
 * `(0,0), (1,0), (1,1), (0,1)`.
 */
export function cellFootprint(i: number, j: number, lattice: Lattice): CellFootprint {
  const baseX = lattice.origin.x + lattice.phase.x;
  const baseY = lattice.origin.y + lattice.phase.y;
  const corner = (di: number, dj: number): Vector2 => ({
    x: baseX + (i + di) * lattice.u.x + (j + dj) * lattice.v.x,
    y: baseY + (i + di) * lattice.u.y + (j + dj) * lattice.v.y,
  });

  return {
    i,
    j,
    corners: [corner(0, 0), corner(1, 0), corner(1, 1), corner(0, 1)],
  };
}

/**
 * Computes the output canvas dimensions from the input's physical extent.
 *
 * The physical extent is `inputWidth / ppi` by `inputHeight / ppi` inches; the
 * output raster is `round-half-up(physical * dpi)` on each axis. This is the
 * only integer rounding in the geometry.
 *
 * Failure split: a computed dimension of zero — whether the input dimension is
 * zero or the physical size rounds down — is rejected with
 * `geometry.empty_canvas`, because the result is an empty canvas. Malformed
 * parameters (negative or non-finite dimensions, non-positive PPI/DPI) are
 * rejected with `geometry.invalid_input`.
 */
export function computeCanvas(input: CanvasInput): CanvasResult {
  const issues: Issue[] = [];
  const raw = asRecord(input);

  if (raw === undefined) {
    issues.push(
      invalidInput('canvas', 'Canvas dimensions require inputWidth, inputHeight, ppi and dpi.'),
    );
    return { status: 'rejected', issues };
  }

  const dimensions: readonly (readonly [string, unknown])[] = [
    ['inputWidth', raw.inputWidth],
    ['inputHeight', raw.inputHeight],
  ];
  for (const [name, value] of dimensions) {
    if (!isNonNegativeFinite(value)) {
      issues.push(invalidInput(name, `${name} must be finite and non-negative.`, value));
    }
  }

  const resolutions: readonly (readonly [string, unknown])[] = [
    ['ppi', raw.ppi],
    ['dpi', raw.dpi],
  ];
  for (const [name, value] of resolutions) {
    if (!isPositiveFinite(value)) {
      issues.push(invalidInput(name, `${name} must be finite and positive.`, value));
    }
  }

  if (resolveOutcomeStatus(issues) === 'rejected') {
    return { status: 'rejected', issues };
  }

  const inputWidth = raw.inputWidth as number;
  const inputHeight = raw.inputHeight as number;
  const ppi = raw.ppi as number;
  const dpi = raw.dpi as number;

  const physicalWidth = inputWidth / ppi;
  const physicalHeight = inputHeight / ppi;
  const width = roundHalfUp(physicalWidth * dpi);
  const height = roundHalfUp(physicalHeight * dpi);

  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    issues.push(
      invalidInput('canvas', 'The computed canvas dimensions are not finite.', { width, height }),
    );
    return { status: 'rejected', issues };
  }

  if (width === 0 || height === 0) {
    issues.push(
      createIssue('geometry.empty_canvas', 'The computed output canvas has a zero dimension', {
        offendingValue: { width, height },
        expected: 'positive output width and height',
        parameter: 'canvas',
      }),
    );
    return { status: 'rejected', issues };
  }

  const canvas: CanvasDimensions = {
    width,
    height,
    physicalWidth,
    physicalHeight,
    dpi,
    ppi,
    roundingRule: 'floor(x+0.5)',
  };

  return { status: 'accepted', issues, canvas };
}

function clampInt(value: number, minimum: number, maximum: number): number {
  if (value < minimum) return minimum;
  if (value > maximum) return maximum;
  return value;
}

/**
 * Edge-clamp mapping: the input pixel that represents an area element at
 * `(x, y)`. Out-of-range coordinates replicate the nearest border pixel, so
 * `floor(-0.2) = -1` clamps to column 0. Requires `width >= 1` and
 * `height >= 1`; a degenerate dimension clamps everything to index 0.
 */
export function clampInputPixel(
  x: number,
  y: number,
  width: number,
  height: number,
): { readonly k: number; readonly l: number } {
  const maxK = Math.max(0, width - 1);
  const maxL = Math.max(0, height - 1);
  return {
    k: clampInt(Math.floor(x), 0, maxK),
    l: clampInt(Math.floor(y), 0, maxL),
  };
}

/** Signed area of a polygon via the shoelace formula, always non-negative. */
export function polygonArea(polygon: readonly Vector2[]): number {
  if (polygon.length < 3) return 0;
  let sum = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    if (current === undefined || next === undefined) continue;
    sum += current.x * next.y - next.x * current.y;
  }
  return Math.abs(sum) / 2;
}

function intersectVertical(a: Vector2, b: Vector2, x: number): Vector2 {
  const dx = b.x - a.x;
  const t = dx === 0 ? 0 : (x - a.x) / dx;
  return { x, y: a.y + t * (b.y - a.y) };
}

function intersectHorizontal(a: Vector2, b: Vector2, y: number): Vector2 {
  const dy = b.y - a.y;
  const t = dy === 0 ? 0 : (y - a.y) / dy;
  return { x: a.x + t * (b.x - a.x), y };
}

function clipEdge(
  polygon: readonly Vector2[],
  inside: (point: Vector2) => boolean,
  intersect: (a: Vector2, b: Vector2) => Vector2,
): Vector2[] {
  const output: Vector2[] = [];
  if (polygon.length === 0) return output;

  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const previous = polygon[(index + polygon.length - 1) % polygon.length];
    if (current === undefined || previous === undefined) continue;

    const currentInside = inside(current);
    const previousInside = inside(previous);
    if (currentInside) {
      if (!previousInside) output.push(intersect(previous, current));
      output.push(current);
    } else if (previousInside) {
      output.push(intersect(previous, current));
    }
  }

  return output;
}

/** Clips a polygon to the axis-aligned rectangle `[x0, x1] x [y0, y1]`. */
function clipPolygonToRect(
  polygon: readonly Vector2[],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Vector2[] {
  let output: Vector2[] = polygon.map((point) => ({ x: point.x, y: point.y }));
  output = clipEdge(
    output,
    (point) => point.x >= x0,
    (a, b) => intersectVertical(a, b, x0),
  );
  output = clipEdge(
    output,
    (point) => point.x <= x1,
    (a, b) => intersectVertical(a, b, x1),
  );
  output = clipEdge(
    output,
    (point) => point.y >= y0,
    (a, b) => intersectHorizontal(a, b, y0),
  );
  output = clipEdge(
    output,
    (point) => point.y <= y1,
    (a, b) => intersectHorizontal(a, b, y1),
  );
  return output;
}

/**
 * Exact area-coverage weights of a footprint against the edge-clamped input.
 *
 * The polygon is intersected with every input pixel it overlaps and each
 * overlap area is attributed to that pixel, clamped to the border by the
 * edge-clamp policy. Because the clipped areas partition the footprint, the
 * weights always sum to the footprint's area: no area is dropped or
 * renormalised when the footprint extends beyond an input side.
 *
 * Returns `[]` for a degenerate polygon or a non-positive input size.
 */
export function coverageWeights(input: CoverageInput): CoverageWeight[] {
  const { polygon, width, height } = input;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) return [];
  if (polygon.length < 3) return [];

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of polygon) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return [];

  const kStart = Math.floor(minX);
  const kEnd = Math.ceil(maxX) - 1;
  const lStart = Math.floor(minY);
  const lEnd = Math.ceil(maxY) - 1;

  const accumulated = new Map<number, CoverageWeight>();
  for (let l = lStart; l <= lEnd; l += 1) {
    for (let k = kStart; k <= kEnd; k += 1) {
      const area = polygonArea(clipPolygonToRect(polygon, k, l, k + 1, l + 1));
      if (!(area > 0)) continue;

      const clampedK = clampInt(k, 0, width - 1);
      const clampedL = clampInt(l, 0, height - 1);
      const pixel = clampedL * width + clampedK;
      const existing = accumulated.get(pixel);
      if (existing === undefined) {
        accumulated.set(pixel, { pixel, k: clampedK, l: clampedL, weight: area });
      } else {
        accumulated.set(pixel, { ...existing, weight: existing.weight + area });
      }
    }
  }

  return [...accumulated.values()];
}

/** Even-odd ray casting: true when the point lies inside the polygon. */
export function pointInPolygon(point: Vector2, polygon: readonly Vector2[]): boolean {
  let inside = false;
  for (
    let index = 0, previous = polygon.length - 1;
    index < polygon.length;
    previous = index, index += 1
  ) {
    const current = polygon[index];
    const prior = polygon[previous];
    if (current === undefined || prior === undefined) continue;

    const crosses = current.y > point.y !== prior.y > point.y;
    if (
      crosses &&
      point.x < ((prior.x - current.x) * (point.y - current.y)) / (prior.y - current.y) + current.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Enumerates the output pixels whose centres lie inside a cell and the canvas.
 *
 * A cell is clipped when its full footprint is not contained in the canvas. An
 * unclipped cell reports its full pixel count as `visible`; a clipped cell
 * reports only the pixels whose centres remain inside the canvas. A cell with
 * `visible = 0` lies entirely outside and is not evaluated downstream.
 */
export function enumerateVisibleFootprint(
  footprint: CellFootprint,
  canvas: { readonly width: number; readonly height: number },
): VisibleFootprint {
  const { corners } = footprint;
  const width = canvas.width;
  const height = canvas.height;
  const clipped = corners.some(
    (corner) => corner.x < 0 || corner.x > width || corner.y < 0 || corner.y > height,
  );

  const pixels: { k: number; l: number }[] = [];
  if (width < 1 || height < 1) return { clipped, visible: 0, pixels };

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const corner of corners) {
    if (corner.x < minX) minX = corner.x;
    if (corner.y < minY) minY = corner.y;
    if (corner.x > maxX) maxX = corner.x;
    if (corner.y > maxY) maxY = corner.y;
  }

  const kStart = Math.max(0, Math.floor(minX));
  const kEnd = Math.min(width - 1, Math.ceil(maxX) - 1);
  const lStart = Math.max(0, Math.floor(minY));
  const lEnd = Math.min(height - 1, Math.ceil(maxY) - 1);

  for (let l = lStart; l <= lEnd; l += 1) {
    for (let k = kStart; k <= kEnd; k += 1) {
      if (pointInPolygon({ x: k + 0.5, y: l + 0.5 }, corners)) pixels.push({ k, l });
    }
  }

  return { clipped, visible: pixels.length, pixels };
}

/**
 * The screening-result fraction `marked / visible` over a footprint.
 *
 * Returns `null` when the cell has no visible output pixel (`visible` not a
 * positive integer), so a fully clipped cell is not evaluated and contributes
 * no trace entry or addressability. Also returns `null` for a non-finite
 * `marked`: a count is finite by definition, and propagating `NaN` into a
 * trace fraction would be worse than treating it as unmeasured. The ratio
 * itself is not clamped: `marked` is the caller's measure over the visible
 * footprint, and silently bounding it would hide a defect in that measure
 * instead of surfacing it.
 */
export function screenFraction(marked: number, visible: number): number | null {
  if (!Number.isInteger(visible) || visible <= 0) return null;
  if (!Number.isFinite(marked)) return null;
  return marked / visible;
}
