import type { Issue } from './issue';

/** A normalized tonal value in [0, 1]. */
export type NormalizedValue = number;

/** One control point of a tone reproduction curve, both coordinates in [0, 1]. */
export interface TrcControlPoint {
  readonly input: NormalizedValue;
  readonly output: NormalizedValue;
}

export type TrcInterpolation = 'linear';

/**
 * A per-channel tone reproduction curve. Points are strictly increasing and
 * unique in their input; an empty point list is an explicit identity curve.
 */
export interface ToneReproductionCurve {
  readonly points: readonly TrcControlPoint[];
  readonly interpolation: TrcInterpolation;
}

/**
 * Highlight critical area (`a_wf`) and shadow critical area (`a_vf`),
 * normalized to [0, 1] with `a_wf < a_vf`.
 */
export interface ReproductionLimits {
  readonly a_wf: NormalizedValue;
  readonly a_vf: NormalizedValue;
}

/**
 * Tonal-chain stage contract.
 *
 * Separation produces each tone channel's commanded value as 16-bit unsigned
 * fixed-point in `[0, 1]`. The tonal chain then exposes three ordered stages
 * per sample: `commanded` (verbatim), `corrected` (after the channel TRC) and
 * `reproducible` (after the reproduction limits). The fourth conceptual stage,
 * the screening result, is produced by the screening stage (ticket 07) and is
 * only carried through the trace, never computed here.
 *
 * An identity transformation is a valid stage: a missing TRC is recorded as an
 * identity curve and a missing limit as identity limits, never as a skipped
 * stage.
 */

/** One tone channel entering the tonal chain, already separated to 16-bit fixed point. */
export interface TonalChannelInput {
  readonly id: string;
  /** Commanded stage from separation: 16-bit unsigned fixed-point tonal values. */
  readonly commanded: Uint16Array;
  /** Declared TRC; absent means identity. */
  readonly trc?: ToneReproductionCurve;
  /** Declared reproduction limits; absent means identity with an informational warning. */
  readonly limits?: ReproductionLimits;
}

/** Aggregate statistics for one tonal stage of one channel, in `[0, 1]`. */
export interface TonalStageSummary {
  readonly min: NormalizedValue;
  readonly max: NormalizedValue;
  readonly mean: NormalizedValue;
  /** Number of samples exactly at the stage minimum (fixed-point 0). */
  readonly atZero: number;
  /** Number of samples exactly at the stage maximum (fixed-point 65535). */
  readonly atOne: number;
}

/** The three computed tonal stages of one channel plus its effective stages. */
export interface TonalChannelResult {
  readonly id: string;
  /** Commanded values, preserved verbatim and never overwritten. */
  readonly commanded: Uint16Array;
  /** Corrected values after the TRC (identity when none is declared). */
  readonly corrected: Uint16Array;
  /** Reproducible values after the limits (identity when none are declared). */
  readonly reproducible: Uint16Array;
  /** Effective TRC recorded as a stage; identity when absent. */
  readonly trc: ToneReproductionCurve;
  readonly trcApplied: boolean;
  /** Effective limits recorded as a stage; identity when absent. */
  readonly limits: ReproductionLimits;
  readonly limitsApplied: boolean;
  readonly summaries: {
    readonly commanded: TonalStageSummary;
    readonly corrected: TonalStageSummary;
    readonly reproducible: TonalStageSummary;
  };
}

/** The tonal chain accepted every channel and produced all three stages. */
export interface AcceptedTonalChain {
  readonly status: 'accepted';
  readonly issues: readonly Issue[];
  readonly channels: readonly TonalChannelResult[];
}

/** The tonal chain rejected the job; a rejection carries no channel data. */
export interface RejectedTonalChain {
  readonly status: 'rejected';
  readonly issues: readonly Issue[];
}

export type TonalChainResult = AcceptedTonalChain | RejectedTonalChain;

/** One traced sample with all four conceptual stage slots. */
export interface TonalTraceEntry {
  readonly index: number;
  readonly commanded: NormalizedValue;
  readonly corrected: NormalizedValue;
  readonly reproducible: NormalizedValue;
  /**
   * Marked area fraction from the screening stage. `null` until the sample is
   * screened; the slot is always present so the fourth stage is never omitted.
   */
  readonly screeningResult: NormalizedValue | null;
}

/** The trace of one channel over the requested samples. */
export interface TonalTrace {
  readonly channelId: string;
  readonly entries: readonly TonalTraceEntry[];
}

/** A rectangular block of sample coordinates, expanded against a row stride. */
export interface TonalTraceRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Trace request: an explicit set of sample indices or a rectangular region.
 * `stride` is the row width in samples, required to expand a region.
 */
export interface TonalTraceRequest {
  readonly samples?: readonly number[];
  readonly region?: TonalTraceRegion;
  readonly stride?: number;
}

/** Optional seam for the screening stage to fill the fourth trace value. */
export interface TonalTraceOptions {
  /** Resolver for the screening-result fraction of a sample index. */
  readonly screeningResultAt?: (sampleIndex: number) => number;
}
