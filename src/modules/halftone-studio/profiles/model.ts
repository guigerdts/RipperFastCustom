/**
 * Production profile document, schema version 1.
 *
 * A profile is the declarative record of a print job's screening setup: what
 * inks exist, at which screen frequency and angle each one is rendered, which
 * separation turns source components into those inks, and at which output
 * resolution the job is screened.
 *
 * Design rules that hold for every version of this schema:
 *
 * - Host-independent. Nothing here knows about Photoshop, UXP or pixels; the
 *   document validates with no host present and is adapted to the engine by an
 *   explicit adapter (`engine-adapter.ts`).
 * - No physical preset. A profile carries the values the operator declared, not
 *   calibrated values inherited from a process. Presets, if they ever exist,
 *   are user data created from this contract.
 * - No invented properties. Every field below is either consumed by the engine
 *   through the adapter, or pure presentation (`displayColor`) that is
 *   explicitly documented as not affecting the result.
 * - Units are never implicit. DPI lives in `output.dpi`; screen frequency lives
 *   in `channels[].screening.lpi`. There is no field whose unit depends on
 *   context.
 *
 * Reserved for future schema versions, deliberately absent so they cannot be
 * mistaken for implemented behaviour:
 *
 * - per-channel tone reproduction curves and reproduction limits (the engine
 *   supports them; schema v1 does not model them yet);
 * - ICC separation (needs captured profile bytes);
 * - ink amounts, overprint and trapping;
 * - process-specific attribute packs.
 */

import type { DotShape } from '../../../engines/halftone/contracts';

/** Schema version this module reads and writes. */
export const PROFILE_SCHEMA_VERSION = 1;

export type ProfileSchemaVersion = typeof PROFILE_SCHEMA_VERSION;

/**
 * Separation modes schema v1 can express. `icc` is intentionally absent: the
 * engine accepts it only with captured profile bytes, which this schema does
 * not carry yet.
 */
export const PROFILE_SEPARATION_MODES = ['channel-preserving', 'linear-mixing'] as const;

export type ProfileSeparationMode = (typeof PROFILE_SEPARATION_MODES)[number];

/** Whether a channel carries a tonal separation or a coverage mask. */
export const PROFILE_DATA_KINDS = ['tone', 'mask'] as const;

export type ProfileDataKind = (typeof PROFILE_DATA_KINDS)[number];

/** Operator-facing facts about the profile. Never consumed by the engine. */
export interface ProfileMetadata {
  readonly name: string;
  /** Free-form note for the operator. `null` when the profile has none. */
  readonly description: string | null;
  /** ISO 8601 timestamp recorded when the profile was created. */
  readonly createdAt: string;
  /** ISO 8601 timestamp recorded by the last accepted edit. */
  readonly updatedAt: string;
}

/** One channel's amplitude-modulation screening. */
export interface ChannelScreening {
  /** Screen frequency in lines per inch. Finite and positive. */
  readonly lpi: number;
  /** Screen angle in degrees, measured from 9 o'clock, clockwise positive. */
  readonly angle: number;
  readonly dotShape: DotShape;
}

/**
 * One ink channel.
 *
 * `inkName` is the ink identity the operator sees and the engine records as the
 * channel role; it is not restricted to process colours, so spot inks and custom
 * separations need no schema change. Two channels may not share an ink name.
 */
export interface ProfileChannel {
  /** Stable identifier, unique within the profile. Referenced by the separation. */
  readonly id: string;
  /** Ink name, for example `cyan` or `spot-orange`. Unique within the profile. */
  readonly inkName: string;
  readonly dataKind: ProfileDataKind;
  /**
   * Presentation colour (`#rrggbb`) used by the future preview and channel list.
   * It never reaches the engine and has no effect on the produced rasters.
   */
  readonly displayColor: string | null;
  readonly screening: ChannelScreening;
}

/** Each source component maps to exactly one ink channel; no mixing. */
export interface ChannelPreservingProfileSeparation {
  readonly mode: 'channel-preserving';
  /** Source component (`r`, `g`, `b`, `gray`) to channel id. */
  readonly channelMap: Readonly<Record<string, string>>;
}

/**
 * One coefficient row per tone channel. The column count depends on the source
 * layout, which belongs to the document, so this validator checks only that the
 * rows are well formed and consistent.
 */
export interface LinearMixingProfileSeparation {
  readonly mode: 'linear-mixing';
  readonly matrix: readonly (readonly number[])[];
}

export type ProfileSeparation = ChannelPreservingProfileSeparation | LinearMixingProfileSeparation;

/** Output resolution the job is screened at. */
export interface ProfileOutput {
  /** Production resolution in dots per inch. Finite and positive. */
  readonly dpi: number;
  /**
   * Resolutions this profile accepts, when it restricts them. `null` means the
   * profile accepts any positive DPI. Mirrors `allowedOutputResolutions`.
   */
  readonly allowedResolutions: readonly number[] | null;
}

/**
 * Constraints the profile declares and the engine enforces. `null` means the
 * profile declares none, which is different from declaring zero.
 */
export interface ProfileConstraints {
  /** Minimum output pixels per halftone cell. */
  readonly minimumCellPixels: number | null;
  /** Minimum input samples per screen line (`PPI / LPI`). */
  readonly minimumInputSamplesPerScreenLine: number | null;
}

/**
 * The complete profile document. Immutable: every edit produces a new document
 * with a new `metadata.updatedAt`.
 */
export interface ProductionProfileDocument {
  readonly schemaVersion: ProfileSchemaVersion;
  /** Stable identity across edits and versions of the same profile. */
  readonly id: string;
  /** Operator-declared edition of this profile, for example `1` or `2.1`. */
  readonly version: string;
  /** Process the profile is declared for, for example `screen-printing`. */
  readonly processKind: string;
  readonly metadata: ProfileMetadata;
  readonly output: ProfileOutput;
  readonly constraints: ProfileConstraints;
  readonly separation: ProfileSeparation;
  readonly channels: readonly ProfileChannel[];
}

/**
 * Output pixels per halftone cell at the given resolution. Below one the screen
 * cannot be represented at all; exactly one is the coarsest addressable screen.
 */
export function cellPixels(outputDpi: number, lpi: number): number {
  return outputDpi / lpi;
}

/** The channels the engine will screen as tone, in declaration order. */
export function toneChannels(profile: ProductionProfileDocument): readonly ProfileChannel[] {
  return profile.channels.filter((channel) => channel.dataKind === 'tone');
}

/** Declared channels keyed by id, for separation lookups. */
export function channelsById(
  profile: ProductionProfileDocument,
): ReadonlyMap<string, ProfileChannel> {
  return new Map(profile.channels.map((channel) => [channel.id, channel]));
}

/**
 * Profile ids become file names in the file-backed repository, so they are
 * restricted to a portable, traversal-safe character set. This is a storage
 * constraint that is part of the contract, not a repository detail: an id that
 * cannot be saved is not a valid id.
 */
export const PROFILE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export const PROFILE_ID_MAX_LENGTH = 128;

export function isSafeProfileId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= PROFILE_ID_MAX_LENGTH &&
    PROFILE_ID_PATTERN.test(value)
  );
}
