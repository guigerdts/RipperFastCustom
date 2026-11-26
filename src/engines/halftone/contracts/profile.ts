import type { JsonValue } from './issue';
import type { ScreeningConfiguration } from './screening';
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
 * The engine treats process attributes as opaque; it only validates declared
 * constraints.
 */
export interface ProductionProfile {
  readonly id: string;
  readonly version: string;
  readonly processKind: ProcessKind;
  readonly channels: readonly InkChannel[];
  readonly processAttributes?: Readonly<Record<string, JsonValue>>;
  readonly allowedOutputResolutions?: readonly number[];
  readonly minimumCellPixels?: number;
}
