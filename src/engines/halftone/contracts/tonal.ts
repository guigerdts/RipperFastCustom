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
