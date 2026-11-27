import type { CellFootprint, Lattice } from './geometry';
import type { Issue } from './issue';

/** Screening methods the contract can name. v1 supports `am` only. */
export type ScreeningMethod = 'am' | 'fm';

export type DotShape = 'round' | 'elliptical' | 'square';

export const DOT_SHAPES: readonly DotShape[] = ['round', 'elliptical', 'square'];

/** Conventional amplitude-modulation parameters for one channel. */
export interface AmScreeningConfiguration {
  readonly method: 'am';
  /** Screen frequency in lines per inch; strictly positive. */
  readonly frequency: number;
  /** Screen angle in degrees from 9 o'clock, clockwise positive. */
  readonly angle: number;
  readonly dotShape: DotShape;
}

/** A method v1 recognises but does not support; rejected during validation. */
export interface UnsupportedScreeningConfiguration {
  readonly method: Exclude<ScreeningMethod, 'am'>;
}

export type ScreeningConfiguration = AmScreeningConfiguration | UnsupportedScreeningConfiguration;

/**
 * A spot function maps in-cell coordinates `(alpha, beta)` in `[0, 1)` to a
 * normalized threshold in `[0, 1]`. Zero is the dot centre and one is the cell
 * boundary, so a threshold is a normalized distance from the centre.
 */
export type SpotFunction = (alpha: number, beta: number) => number;

export interface AcceptedSpotFunction {
  readonly status: 'accepted';
  readonly issues: readonly Issue[];
  readonly shape: DotShape;
  readonly threshold: SpotFunction;
}

export interface RejectedSpotFunction {
  readonly status: 'rejected';
  readonly issues: readonly Issue[];
}

export type SpotFunctionResult = AcceptedSpotFunction | RejectedSpotFunction;

/** A single-channel input plane in input-pixel space, normalized to `[0, 1]`. */
export interface SamplingImage {
  /** Row-major samples; `data.length` must equal `width * height`. */
  readonly data: Float64Array;
  readonly width: number;
  readonly height: number;
}

/**
 * Sampling fallback recorded for a cell: `none` when exact area coverage was
 * used, `containing-pixel` when the footprint is smaller than one input pixel
 * and the value of the pixel containing the cell centre was used instead.
 */
export type SamplingFallback = 'none' | 'containing-pixel';

export interface SampleCellInput {
  /** The cell footprint in input space; build it from an input-space lattice. */
  readonly footprint: CellFootprint;
  readonly image: SamplingImage;
}

export interface AcceptedSampleCell {
  readonly status: 'accepted';
  readonly issues: readonly Issue[];
  /** Area-weighted normalized tonal value in `[0, 1]`. */
  readonly value: number;
  readonly fallback: SamplingFallback;
  /** Total overlap weight used as the denominator. */
  readonly weight: number;
  /** Number of input pixels that contributed area. */
  readonly samples: number;
}

export interface RejectedSampleCell {
  readonly status: 'rejected';
  readonly issues: readonly Issue[];
}

export type SampleCellResult = AcceptedSampleCell | RejectedSampleCell;

/** One output pixel's threshold decision inside a cell. */
export interface ScreenPixelDecision {
  readonly k: number;
  readonly l: number;
  /** Spot-function threshold at the pixel centre, in `[0, 1]`. */
  readonly threshold: number;
  /** True when the reproducible value strictly exceeds the threshold. */
  readonly marked: boolean;
}

export interface RasterizeCellInput {
  /** The cell footprint in output space. */
  readonly footprint: CellFootprint;
  readonly canvas: { readonly width: number; readonly height: number };
  /** The output-space lattice the footprint was built from. */
  readonly lattice: Lattice;
  /** Reproducible tonal value for this cell, in `[0, 1]`. */
  readonly value: number;
  /** Requested dot shape; validated against the declared vocabulary. */
  readonly dotShape: string;
}

export interface AcceptedRasterizedCell {
  readonly status: 'accepted';
  readonly issues: readonly Issue[];
  /** False when the cell has no visible output pixel; it is not evaluated. */
  readonly evaluated: boolean;
  readonly clipped: boolean;
  /** Output pixels whose centres lie inside both the cell and the canvas. */
  readonly visible: number;
  readonly marked: number;
  /** `marked / visible`, or `null` when the cell is not evaluated. */
  readonly fraction: number | null;
  readonly pixels: readonly ScreenPixelDecision[];
}

export interface RejectedRasterizedCell {
  readonly status: 'rejected';
  readonly issues: readonly Issue[];
}

export type RasterizeCellResult = AcceptedRasterizedCell | RejectedRasterizedCell;

export interface AddressabilityInput {
  readonly lattice: Lattice;
  readonly canvas: { readonly width: number; readonly height: number };
  readonly dotShape: string;
}

/**
 * Digital addressability report for one geometry and spot function.
 *
 * `addressableCoverageCount` is derived from the actual thresholding result:
 * the distinct `marked / visible` fractions the binary raster can produce on
 * unclipped cells. `cellPixelCount` is reported separately, because sub-pixel
 * placement and the spot function can make the two differ.
 */
export interface AddressabilityReport {
  readonly shape: DotShape;
  /** Largest visible pixel count among evaluated cells: the nominal full cell. */
  readonly cellPixelCount: number;
  /** Distinct visible pixel counts observed across evaluated cells. */
  readonly cellPixelCounts: readonly number[];
  /** Distinct digital coverages the binary raster can produce. */
  readonly addressableCoverageCount: number;
  /** Sorted, unique coverage fractions in `[0, 1]`. */
  readonly coverages: readonly number[];
  readonly cellsEvaluated: number;
}

export interface AcceptedAddressability {
  readonly status: 'accepted';
  readonly issues: readonly Issue[];
  readonly report: AddressabilityReport;
}

export interface RejectedAddressability {
  readonly status: 'rejected';
  readonly issues: readonly Issue[];
}

export type AddressabilityResult = AcceptedAddressability | RejectedAddressability;
