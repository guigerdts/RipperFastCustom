import type { Issue } from './issue';

/**
 * AM geometry contract.
 *
 * The lattice is global: it is anchored at the output canvas origin with phase
 * 0, and every row, tile and block reuses the same origin, phase and basis. A
 * tile boundary never re-anchors or shifts it. All geometry is computed in
 * double precision and no intermediate value is rounded; only the output canvas
 * dimension is rounded, with `round-half-up(x) = floor(x + 0.5)`.
 *
 * The same builders serve output space (resolution = output DPI) and input
 * space (resolution = input PPI): sampling is independent of output resolution
 * because the physical cell side is `1 / LPI` inch in either space.
 */

/** A point or vector in the halftone coordinate system: `x` right, `y` down. */
export interface Vector2 {
  readonly x: number;
  readonly y: number;
}

/** Declared global lattice origin: the canvas origin. */
export const LATTICE_ORIGIN: Vector2 = Object.freeze({ x: 0, y: 0 });

/** Declared global lattice phase: 0, so a cell corner coincides with the origin. */
export const LATTICE_PHASE: Vector2 = Object.freeze({ x: 0, y: 0 });

/**
 * An infinite AM lattice in one space.
 *
 * `u` has length `pitch` and points along the 9 o'clock direction (the negative
 * `x` axis) rotated clockwise by `angle`; `v` is `u` rotated 90 degrees
 * clockwise and has the same length. Zero degrees is 9 o'clock and positive
 * angles increase clockwise.
 */
export interface Lattice {
  /** Resolution of this space: output DPI, or input PPI for input space. */
  readonly resolution: number;
  /** Screen frequency in lines per inch; strictly positive. */
  readonly lpi: number;
  /** Screen angle in degrees from 9 o'clock, clockwise positive. */
  readonly angle: number;
  /** Cell pitch in this space's pixels: `resolution / lpi`. */
  readonly pitch: number;
  readonly origin: Vector2;
  readonly phase: Vector2;
  readonly u: Vector2;
  readonly v: Vector2;
}

/** A point's cell index and in-cell fractional coordinates. */
export interface CellAddress {
  /** Column index; `floor(a)` and therefore possibly negative. */
  readonly i: number;
  /** Row index; `floor(b)` and therefore possibly negative. */
  readonly j: number;
  /** In-cell column fraction in `[0, 1)`. */
  readonly alpha: number;
  /** In-cell row fraction in `[0, 1)`. */
  readonly beta: number;
}

/** The four corners of a cell parallelogram, in this space's coordinates. */
export interface CellFootprint {
  readonly i: number;
  readonly j: number;
  readonly corners: readonly [Vector2, Vector2, Vector2, Vector2];
}

/** Output canvas dimensions and the parameters that produced them. */
export interface CanvasDimensions {
  readonly width: number;
  readonly height: number;
  /** Physical width in inches: `inputWidth / ppi`. */
  readonly physicalWidth: number;
  /** Physical height in inches: `inputHeight / ppi`. */
  readonly physicalHeight: number;
  readonly dpi: number;
  readonly ppi: number;
  readonly roundingRule: 'floor(x+0.5)';
}

/** One area-coverage weight attributed to an edge-clamped input pixel. */
export interface CoverageWeight {
  /** Row-major index into the input: `l * width + k`. */
  readonly pixel: number;
  /** Clamped column index in `[0, width - 1]`. */
  readonly k: number;
  /** Clamped row index in `[0, height - 1]`. */
  readonly l: number;
  /** Overlap area in input-pixel-squared units. */
  readonly weight: number;
}

/** The output pixels whose centres lie inside a cell and the canvas. */
export interface VisibleFootprint {
  /** True when the cell's full footprint is not contained in the canvas. */
  readonly clipped: boolean;
  /** Number of output pixels whose centres lie inside the cell and the canvas. */
  readonly visible: number;
  readonly pixels: readonly { readonly k: number; readonly l: number }[];
}

/** Inputs for building a lattice. `resolution` is DPI (output) or PPI (input). */
export interface LatticeInput {
  readonly resolution: number;
  readonly lpi: number;
  readonly angle: number;
}

/** Inputs for computing the output canvas dimensions. */
export interface CanvasInput {
  readonly inputWidth: number;
  readonly inputHeight: number;
  readonly ppi: number;
  readonly dpi: number;
}

/** Inputs for area-coverage weighting of a footprint in input space. */
export interface CoverageInput {
  readonly polygon: readonly Vector2[];
  readonly width: number;
  readonly height: number;
}

export interface AcceptedLattice {
  readonly status: 'accepted';
  readonly issues: readonly Issue[];
  readonly lattice: Lattice;
}

export interface RejectedLattice {
  readonly status: 'rejected';
  readonly issues: readonly Issue[];
}

export type LatticeResult = AcceptedLattice | RejectedLattice;

export interface AcceptedCanvas {
  readonly status: 'accepted';
  readonly issues: readonly Issue[];
  readonly canvas: CanvasDimensions;
}

export interface RejectedCanvas {
  readonly status: 'rejected';
  readonly issues: readonly Issue[];
}

export type CanvasResult = AcceptedCanvas | RejectedCanvas;
