import type { ScreeningConfiguration } from './screening';
import type { SeparationDeclaration } from './separation';
import type { ReproductionLimits, ToneReproductionCurve } from './tonal';

/** Known process kinds. The field itself is an open, extensible string. */
export const KNOWN_PROCESS_KINDS = ['screen-printing', 'dtf', 'offset-cmyk'] as const;

export type ProcessKind = (typeof KNOWN_PROCESS_KINDS)[number] | (string & Record<never, never>);

/** A process colour name, or the reserved `white` role. */
export type ChannelRole = string;

export const WHITE_ROLE = 'white';

/** Whether a channel carries a tonal separation or a coverage mask. */
export type ChannelDataKind = 'tone' | 'mask';

/** One ink separation owned by a production profile. */
export interface InkChannel {
  readonly id: string;
  readonly role: ChannelRole;
  readonly dataKind: ChannelDataKind;
  readonly screening: ScreeningConfiguration;
  readonly trc?: ToneReproductionCurve;
  readonly limits?: ReproductionLimits;
}

/**
 * The named, versioned set of process conditions that owns concrete values.
 *
 * `processKind` is an open, extensible discriminant. Process-specific attributes
 * are not a free-form property bag on the shared contract: a concrete process
 * profile parameterises `TProcessAttributes` with its own typed interface (for
 * example a future `DtfAttributes`), and the engine treats that payload as
 * opaque except for declared constraints. The shared base defaults the slot to
 * `never`, so it cannot carry unspecified attributes.
 */
export interface ProductionProfile<TProcessAttributes = never> {
  readonly id: string;
  readonly version: string;
  readonly processKind: ProcessKind;
  readonly channels: readonly InkChannel[];
  /**
   * The declared conversion from input data to ink channels. Optional only so
   * a mask-only profile is representable; a profile with tone channels and no
   * declaration is rejected by the separation stage instead of being converted
   * implicitly.
   */
  readonly separation?: SeparationDeclaration;
  readonly allowedOutputResolutions?: readonly number[];
  readonly minimumCellPixels?: number;
  readonly processAttributes?: TProcessAttributes;
}
