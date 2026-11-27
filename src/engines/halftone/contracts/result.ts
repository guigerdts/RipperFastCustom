/**
 * Result envelope and self-contained snapshot for the halftone engine.
 *
 * The envelope is discriminated by `status`, and each branch carries exactly
 * what it can legitimately hold: a completed run owns rasters, per-channel
 * metadata and a sealed snapshot; a rejected run owns only structured
 * diagnostics; a cancelled run owns only structured diagnostics. A partial
 * result is never labelled `completed`.
 *
 * The snapshot records effective values, not references. A hash identifies
 * content; it never replaces it.
 */

import type { Issue } from './issue';
import type { ChannelDataKind, ChannelRole } from './profile';
import type { HashAlgorithm } from './separation';
import type { AddressabilityReport, SamplingFallback } from './screening';
import type { TonalStageSummary, ToneReproductionCurve, ReproductionLimits } from './tonal';
import type { Vector2 } from './geometry';

/** Version of the engine behaviour recorded in every snapshot. */
export const HALFTONE_ENGINE_VERSION = '1';

/** The single tonal quantisation rule the engine applies. */
export const TONAL_QUANTISATION_RULE = 'floor(x*65535+0.5)/65535';

/** Sampling rule recorded per channel. */
export type SamplingRule = 'area-coverage' | SamplingFallback;

/** One binary raster: one byte per output pixel, row-major, values `0` or `1`. */
export interface ChannelRaster {
  readonly channelId: string;
  readonly role: ChannelRole;
  readonly dataKind: ChannelDataKind;
  readonly width: number;
  readonly height: number;
  readonly dpi: number;
  readonly bitsPerPixel: 1;
  readonly data: Uint8Array;
}

/** Effective per-channel metadata attached to a completed result. */
export interface ChannelResultMetadata {
  readonly channelId: string;
  readonly role: ChannelRole;
  readonly dataKind: ChannelDataKind;
  /** Identity of the separation transform that produced the channel data. */
  readonly separationTransformId: string;
  readonly frequency: number;
  readonly angle: number;
  readonly dotShape: string;
  readonly samplingRule: SamplingRule;
  readonly trc: ToneReproductionCurve;
  readonly trcApplied: boolean;
  readonly limits: ReproductionLimits;
  readonly limitsApplied: boolean;
  readonly addressability: AddressabilityReport;
  readonly summaries: {
    readonly commanded: TonalStageSummary;
    readonly corrected: TonalStageSummary;
    readonly reproducible: TonalStageSummary;
    readonly screened: TonalStageSummary;
  };
}

/**
 * Effective lattice and boundary conventions.
 *
 * A job may screen each channel at its own angle and frequency, so the basis
 * below belongs to `referenceChannelId`; the authoritative per-channel values
 * are `channels[].angle` and `channels[].frequency`.
 */
export interface SnapshotLattice {
  readonly referenceChannelId: string;
  readonly resolution: number;
  readonly lpi: number;
  readonly angle: number;
  readonly pitch: number;
  readonly origin: Vector2;
  readonly phase: Vector2;
  readonly basis: { readonly u: Vector2; readonly v: Vector2 };
  readonly angularConvention: '9-oclock-clockwise';
  readonly pixelCentreConvention: 'centre-at-half-integer';
  readonly boundaryPolicy: 'edge-clamp-with-clipped-flag';
}

/** Effective input characteristics. */
export interface SnapshotInput {
  readonly width: number;
  readonly height: number;
  readonly ppi: number;
  readonly bitDepth: 8 | 16;
  readonly layout: 'rgb' | 'grayscale';
  readonly iccId: string | null;
  readonly sourceKind: 'continuous-tone' | 'prepared-artwork';
  /** `ppi / lpi` when every channel shares one frequency, otherwise `null`. */
  readonly samplesPerScreenLine: number | null;
  /** The profile's declared minimum cell size, in output pixels. */
  readonly minimumCellPixels: number | null;
  /** The profile's declared minimum input samples per screen line, when any. */
  readonly minimumInputSamplesPerScreenLine: number | null;
}

/** Effective canvas characteristics. */
export interface SnapshotCanvas {
  readonly width: number;
  readonly height: number;
  readonly roundingRule: string;
  readonly suppliedPpi: number;
  readonly suppliedDpi: number;
  readonly physicalWidth: number;
  readonly physicalHeight: number;
}

/** Effective separation provenance, with every value needed to reconstruct it. */
export type SnapshotSeparation =
  | {
      readonly mode: 'channel-preserving';
      readonly identity: SnapshotTransformIdentity;
      readonly channelMap: Readonly<Record<string, string>>;
      readonly transferFunctions: Readonly<
        Record<
          string,
          {
            readonly points: readonly { input: number; output: number }[];
            readonly interpolation: string;
          }
        >
      >;
    }
  | {
      readonly mode: 'linear-mixing';
      readonly identity: SnapshotTransformIdentity;
      readonly matrix: readonly (readonly number[])[];
      readonly transferFunctions: Readonly<
        Record<
          string,
          {
            readonly points: readonly { input: number; output: number }[];
            readonly interpolation: string;
          }
        >
      >;
    }
  | {
      readonly mode: 'icc';
      readonly identity: SnapshotTransformIdentity;
      readonly provenance: {
        readonly sourceProfileId: string;
        readonly sourceProfileHash: string;
        readonly destinationProfileId: string;
        readonly destinationProfileHash: string;
        readonly renderingIntent: string;
        readonly blackPointCompensation: boolean;
      };
      /** Captured profile bytes; a path to an editable file is never enough. */
      readonly sourceProfileBytes: Uint8Array;
      readonly destinationProfileBytes: Uint8Array;
    };

export interface SnapshotTransformIdentity {
  readonly id: string;
  readonly version: string;
  readonly type: string;
  readonly parameterHash: string;
  readonly hashAlgorithm: HashAlgorithm;
  readonly canonicalisationVersion: string;
}

/** Effective configuration of one channel inside the snapshot. */
export interface SnapshotChannel {
  readonly channelId: string;
  readonly role: ChannelRole;
  readonly dataKind: ChannelDataKind;
  readonly separationTransformId: string;
  readonly frequency: number;
  readonly angle: number;
  readonly dotShape: string;
  readonly samplingRule: SamplingRule;
  readonly trc: ToneReproductionCurve;
  readonly trcApplied: boolean;
  readonly limits: ReproductionLimits;
  readonly limitsApplied: boolean;
  readonly cellPixelCount: number;
  readonly addressableCoverageCount: number;
}

/** Explicit override acknowledgements recorded for reproducibility. */
export interface SnapshotOverrides {
  readonly preparedArtwork: { readonly acknowledged: boolean; readonly reason: string } | null;
}

/** Everything the snapshot records, before the hash is computed. */
export interface UnsealedSnapshot {
  readonly canonicalisationVersion: string;
  readonly hashAlgorithm: HashAlgorithm;
  readonly engine: { readonly version: string; readonly quantisationRule: string };
  readonly profile: {
    readonly id: string;
    readonly version: string;
    readonly parameterHash: string;
  };
  readonly process: { readonly kind: string; readonly screeningMethod: 'am' | 'fm' };
  /** `lpi` is the shared screen frequency, or `null` when channels differ. */
  readonly output: { readonly dpi: number; readonly lpi: number | null };
  readonly input: SnapshotInput;
  readonly canvas: SnapshotCanvas;
  readonly lattice: SnapshotLattice;
  readonly separation: SnapshotSeparation;
  readonly channels: readonly SnapshotChannel[];
  readonly overrides: SnapshotOverrides;
  readonly preview: { readonly enabled: boolean; readonly resolution: number | null };
}

/** The sealed snapshot: the unsealed record plus the hash over its canonical bytes. */
export interface ResultSnapshot extends UnsealedSnapshot {
  /** SHA-256 over the canonical bytes of every other field, lowercase hex. */
  readonly hash: string;
}

/** A completed run. It owns rasters, metadata and the snapshot. */
export interface CompletedResult {
  readonly status: 'completed';
  readonly rasters: readonly ChannelRaster[];
  readonly channels: readonly ChannelResultMetadata[];
  readonly snapshot: ResultSnapshot;
  readonly issues: readonly Issue[];
  /**
   * Channel ids in the order they were composed. This is not the per-cell
   * tonal stage trace defined in the spec; that record belongs to the trace
   * API and is not produced here.
   */
  readonly channelOrder: readonly string[];
}

/** A rejected run. By construction it owns no raster and no snapshot. */
export interface RejectedResult {
  readonly status: 'rejected';
  readonly issues: readonly Issue[];
}

/** A cancelled run. By construction it owns no raster and no snapshot. */
export interface CancelledResult {
  readonly status: 'cancelled';
  readonly issues: readonly Issue[];
}

export type ScreeningResult = CompletedResult | RejectedResult | CancelledResult;

/** Narrowing helper for callers that must not treat a cancelled run as complete. */
export function isCompletedResult(result: ScreeningResult): result is CompletedResult {
  return result.status === 'completed';
}

/** A rectangular slice of the output canvas, in output pixels. */
export interface OutputTile {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
