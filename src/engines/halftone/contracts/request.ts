import type { Issue } from './issue';
import type { ProductionProfile } from './profile';

export type BitDepth = 8 | 16;
export type InputLayout = 'rgb' | 'grayscale';
export type InputSourceKind = 'continuous-tone' | 'prepared-artwork';

/**
 * Continuous-tone raster input. Validation and prepared-artwork detection are
 * ticket 03; this module only fixes the shape the request carries.
 */
export interface ContinuousToneInput {
  readonly width: number;
  readonly height: number;
  readonly ppi: number;
  readonly bitDepth: BitDepth;
  readonly layout: InputLayout;
  readonly data: Uint8Array | Uint16Array;
  readonly icc?: string;
  readonly sourceKind?: InputSourceKind;
}

export interface OutputSettings {
  readonly dpi: number;
}

/**
 * The single public screening request envelope. `TProcessAttributes` mirrors the
 * profile's typed, process-specific attribute slot so an attributed profile stays
 * representable; the default base profile carries none.
 */
export interface ScreeningRequest<TProcessAttributes = never> {
  readonly input: ContinuousToneInput;
  readonly profile: ProductionProfile<TProcessAttributes>;
  readonly output: OutputSettings;
}

export type OutcomeStatus = 'completed' | 'rejected' | 'cancelled';

/** Rasters, snapshot and stage summaries are added by ticket 08. */
export interface CompletedOutcome {
  readonly status: 'completed';
  readonly issues: readonly Issue[];
}

export interface RejectedOutcome {
  readonly status: 'rejected';
  readonly issues: readonly Issue[];
}

export interface CancelledOutcome {
  readonly status: 'cancelled';
  readonly issues: readonly Issue[];
}

export type ScreeningOutcome = CompletedOutcome | RejectedOutcome | CancelledOutcome;
