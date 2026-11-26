import type { Issue } from './issue';
import type { ChannelDataKind, ChannelRole, ProductionProfile } from './profile';
import type { ContinuousToneInput, InputLayout } from './request';
import type { TrcControlPoint, TrcInterpolation } from './tonal';

/**
 * Separation contract: how continuous-tone input becomes the ink channels a
 * production profile declares.
 *
 * v1 admits exactly three modes and nothing else: a channel-preserving declared
 * mapping, declared linear mixing with an explicit coefficient matrix, and an
 * ICC transform injected by the caller. There is no implicit RGB-to-CMYK or
 * RGB-to-N conversion, no hidden matrix and no inferred colourimetric
 * transform. A conversion exists only when the profile declares it or the
 * caller injects it.
 *
 * Every declaration carries a reproducible identity and provenance. The engine
 * validates that the required fields are present and well formed and records
 * caller-supplied hashes; it never attests to their truth.
 */

export const SEPARATION_MODES = ['channel-preserving', 'linear-mixing', 'icc'] as const;

export type SeparationMode = (typeof SEPARATION_MODES)[number];

export const HASH_ALGORITHMS = ['sha256'] as const;

export type HashAlgorithm = (typeof HASH_ALGORITHMS)[number];

/** Version of the canonical form the hashes were computed with. */
export const CANONICALISATION_VERSION = '1';

export const ICC_RENDERING_INTENTS = [
  'perceptual',
  'relative-colorimetric',
  'saturation',
  'absolute-colorimetric',
] as const;

export type IccRenderingIntent = (typeof ICC_RENDERING_INTENTS)[number];

/** A lowercase SHA-256 digest: 64 hexadecimal digits. */
export const HASH_PATTERN = /^[0-9a-f]{64}$/;

/**
 * Stable identity of one separation transform. The parameter hash covers the
 * effective mapping, matrix and transfer functions (or every ICC parameter
 * that affects the result); the hash algorithm and canonicalisation version
 * are recorded next to it.
 */
export interface TransformIdentity {
  readonly id: string;
  readonly version: string;
  readonly type: SeparationMode;
  readonly parameterHash: string;
  readonly hashAlgorithm: HashAlgorithm;
  readonly canonicalisationVersion: string;
}

/** Optional per-channel transfer function applied after the declared mapping. */
export interface SeparationTransferFunction {
  readonly points: readonly TrcControlPoint[];
  readonly interpolation: TrcInterpolation;
}

/** Each input channel maps to exactly one ink channel; no channel mixing. */
export interface ChannelPreservingSeparation {
  readonly mode: 'channel-preserving';
  readonly identity: TransformIdentity;
  /** Input channel id (`r`, `g`, `b` or `gray`) to ink channel id. */
  readonly channelMap: Readonly<Record<string, string>>;
  /** Transfer functions keyed by ink channel id. */
  readonly transferFunctions?: Readonly<Record<string, SeparationTransferFunction>>;
}

/** One explicit coefficient matrix from input channels to tone channels. */
export interface LinearMixingSeparation {
  readonly mode: 'linear-mixing';
  readonly identity: TransformIdentity;
  /** One row per tone channel in profile order, one column per input channel. */
  readonly matrix: readonly (readonly number[])[];
  /** Transfer functions keyed by ink channel id. */
  readonly transferFunctions?: Readonly<Record<string, SeparationTransferFunction>>;
}

/** Reproducible ICC provenance supplied by the caller. */
export interface IccProvenance {
  readonly sourceProfileId: string;
  readonly sourceProfileHash: string;
  readonly destinationProfileId: string;
  readonly destinationProfileHash: string;
  readonly renderingIntent: IccRenderingIntent;
  readonly blackPointCompensation: boolean;
}

/** An ICC transform declared by the profile and injected by the caller. */
export interface IccSeparation {
  readonly mode: 'icc';
  readonly identity: TransformIdentity;
  readonly provenance: IccProvenance;
}

export type SeparationDeclaration =
  ChannelPreservingSeparation | LinearMixingSeparation | IccSeparation;

/** Normalized input samples, one row-major array per input channel. */
export interface IccTransformInput {
  readonly width: number;
  readonly height: number;
  readonly layout: InputLayout;
  readonly channels: readonly (readonly number[])[];
}

/**
 * Pure, deterministic converter injected by the caller. The engine embeds no
 * colour science: it validates the shape and range of the returned channels
 * and records the declaration's provenance.
 */
export type IccConverter = (input: IccTransformInput) => readonly (readonly number[])[];

/** Explicit coverage source for one mask channel. */
export interface MaskSource {
  readonly channelId: string;
  /** Stable identity recorded per produced channel. */
  readonly identity: string;
  readonly width: number;
  readonly height: number;
  /** One coverage sample per pixel, `0` = no ink and `255` = full coverage. */
  readonly data: Uint8Array;
}

/** One produced ink channel with its transform identity. */
export interface SeparatedChannel {
  readonly id: string;
  readonly role: ChannelRole;
  readonly dataKind: ChannelDataKind;
  /** Identity of the transform (or mask source) that produced this channel. */
  readonly transformIdentity: string;
  /** 16-bit unsigned fixed-point tonal values in `[0, 1]`, row-major. */
  readonly data: Uint16Array;
}

/** Everything the separation stage reads. It runs after the input gate. */
export interface SeparationStageInput<TProcessAttributes = never> {
  readonly input: ContinuousToneInput;
  readonly profile: ProductionProfile<TProcessAttributes>;
  readonly iccConverter?: IccConverter;
  readonly maskSources?: readonly MaskSource[];
}

/** The stage produced exactly the channels the profile declares. */
export interface AcceptedSeparation {
  readonly status: 'accepted';
  readonly issues: readonly Issue[];
  readonly channels: readonly SeparatedChannel[];
  /** The declared transform descriptors, stored once per transform. */
  readonly transforms: readonly SeparationDeclaration[];
}

/**
 * The stage rejected the job. By construction this result carries no channel
 * data: a rejection never allocates or returns separated output.
 */
export interface RejectedSeparation {
  readonly status: 'rejected';
  readonly issues: readonly Issue[];
}

export type SeparationResult = AcceptedSeparation | RejectedSeparation;
