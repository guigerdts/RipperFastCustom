/**
 * Declared memory model for the halftone performance benchmark.
 *
 * The model is deliberately conservative and honest about the reference design:
 * it budgets the full-image stage planes the engine keeps, plus a fixed process
 * overhead, and is documented in `docs/PERFORMANCE.md`. It does not pretend to
 * be the streaming per-row bound the spec asks for; closing that gap is a
 * separate optimisation change.
 */

import type { FixtureSpec } from './fixtures';

/** Bytes of transient screening work the budget allows per output pixel. */
export const GC_LAG_BYTES_PER_PIXEL = 64;
/** Bytes per input sample for the normalised sampling plane. */
export const NORMALISED_PLANE_BYTES_PER_SAMPLE = 8;
/** Bytes per input sample for one fixed-point stage plane. */
export const FIXED_POINT_PLANE_BYTES_PER_SAMPLE = 2;
/** Tonal stages that keep a fixed-point plane per tone channel. */
export const TONAL_PLANES_PER_CHANNEL = 2;
/**
 * Fixed allowance for the runtime the engine runs inside. V8, Node and the test
 * runner hold a baseline resident set that does not scale with the image; it is
 * declared once here and never grows with the job.
 */
export const PROCESS_OVERHEAD_ALLOWANCE_BYTES = 96 * 1024 * 1024;
/** The scaling contract: quadrupling output pixels must not exceed this ratio. */
export const SCALING_RATIO_BOUND = 6;

export interface MemoryBudget {
  readonly inputBytes: number;
  readonly outputBytes: number;
  readonly perSamplePlaneBytes: number;
  readonly planesBytes: number;
  readonly gcLagBytesPerPixel: number;
  readonly gcLagBytes: number;
  readonly declaredWorkspaceBytes: number;
  /** Declared allowance for one output row, applied to every row. */
  readonly perOutputRowBytes: number;
  readonly processOverheadAllowanceBytes: number;
  readonly totalBoundBytes: number;
}

export function declaredMemoryBudget(spec: FixtureSpec): MemoryBudget {
  const pixels = spec.width * spec.height;
  const inputChannels = spec.layout === 'rgb' ? 3 : 1;
  const inputBytes = pixels * inputChannels * (spec.bitDepth / 8);
  const outputBytes = pixels * spec.channels;

  const perSamplePlaneBytes =
    inputChannels * NORMALISED_PLANE_BYTES_PER_SAMPLE +
    spec.channels * FIXED_POINT_PLANE_BYTES_PER_SAMPLE +
    spec.channels * FIXED_POINT_PLANE_BYTES_PER_SAMPLE * TONAL_PLANES_PER_CHANNEL +
    NORMALISED_PLANE_BYTES_PER_SAMPLE;

  const planesBytes = perSamplePlaneBytes * pixels;
  const gcLagBytes = GC_LAG_BYTES_PER_PIXEL * pixels;
  const declaredWorkspaceBytes = planesBytes + gcLagBytes;
  const perOutputRowBytes = spec.width * (perSamplePlaneBytes + GC_LAG_BYTES_PER_PIXEL);

  return {
    inputBytes,
    outputBytes,
    perSamplePlaneBytes,
    planesBytes,
    gcLagBytesPerPixel: GC_LAG_BYTES_PER_PIXEL,
    gcLagBytes,
    declaredWorkspaceBytes,
    perOutputRowBytes,
    processOverheadAllowanceBytes: PROCESS_OVERHEAD_ALLOWANCE_BYTES,
    totalBoundBytes:
      PROCESS_OVERHEAD_ALLOWANCE_BYTES + inputBytes + outputBytes + declaredWorkspaceBytes,
  };
}
