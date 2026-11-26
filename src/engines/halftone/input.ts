/**
 * Input gate for the halftone engine.
 *
 * The gate validates a continuous-tone raster before any separation or
 * screening work happens. It accepts RGB or grayscale material at 8 or 16 bits
 * with an explicit, positive PPI, and rejects anything the engine cannot treat
 * as continuous tone.
 *
 * Prepared-artwork detection uses four declared signals:
 *
 * - `source-kind` — the caller declared the input as prepared artwork;
 * - `bit-depth` — 1-bit material is binary, never continuous tone;
 * - `layout` — pre-separated ink sets and pre-screened bitmap layouts;
 * - `tonal-distribution` — the documented check below.
 *
 * A caller may override the detection only for the declaration and
 * distribution signals, and only with an explicit acknowledgment and a
 * non-empty reason. A binary bit depth or a pre-separated/pre-screened layout
 * describes material the engine cannot represent as continuous tone, so no
 * override makes it screenable.
 */

import { createIssue, resolveOutcomeStatus, toJsonValue } from './contracts/issue';
import type { Issue } from './contracts/issue';
import type { ContinuousToneInput } from './contracts/request';

export const SUPPORTED_BIT_DEPTHS = [8, 16] as const;
export type SupportedBitDepth = (typeof SUPPORTED_BIT_DEPTHS)[number];

export const SUPPORTED_LAYOUTS = ['rgb', 'grayscale'] as const;
export type SupportedLayout = (typeof SUPPORTED_LAYOUTS)[number];

/**
 * Layout declarations that describe material outside the continuous-tone
 * contract: pre-separated ink sets and pre-screened bitmaps. They are reported
 * as prepared artwork instead of being silently reinterpreted as RGB or
 * grayscale.
 */
export const PREPARED_ARTWORK_LAYOUTS = [
  'cmyk',
  'cmyka',
  'separated',
  'pre-separated',
  'bitmap',
  'binary',
  'pre-screened',
] as const;

export type PreparedArtworkSignal = 'source-kind' | 'bit-depth' | 'layout' | 'tonal-distribution';

/** The override a snapshot records for a completed prepared-artwork run. */
export interface PreparedArtworkOverrideRecord {
  readonly kind: 'prepared-artwork';
  readonly reason: string;
  readonly signals: readonly PreparedArtworkSignal[];
}

/** The gate accepted the input and may pass it to the next stage. */
export interface AcceptedInput {
  readonly status: 'accepted';
  readonly issues: readonly Issue[];
  readonly overrides: readonly PreparedArtworkOverrideRecord[];
}

/**
 * The gate rejected the input. By construction this result carries no raster,
 * snapshot or stage data: a rejection never allocates or returns image output.
 */
export interface RejectedInput {
  readonly status: 'rejected';
  readonly issues: readonly Issue[];
}

export type InputGateResult = AcceptedInput | RejectedInput;

const CHANNELS_BY_LAYOUT: Record<SupportedLayout, number> = {
  rgb: 3,
  grayscale: 1,
};

const MAX_SAMPLE_BY_BIT_DEPTH: Record<SupportedBitDepth, number> = {
  8: 0xff,
  16: 0xffff,
};

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isSupportedBitDepth(value: unknown): value is SupportedBitDepth {
  return value === 8 || value === 16;
}

function isSupportedLayout(value: unknown): value is SupportedLayout {
  return value === 'rgb' || value === 'grayscale';
}

function isPreparedArtworkLayout(value: unknown): boolean {
  return (
    typeof value === 'string' && (PREPARED_ARTWORK_LAYOUTS as readonly string[]).includes(value)
  );
}

function bufferForDepth(
  data: unknown,
  bitDepth: SupportedBitDepth,
): Uint8Array | Uint16Array | undefined {
  if (bitDepth === 8) return data instanceof Uint8Array ? data : undefined;
  return data instanceof Uint16Array ? data : undefined;
}

function describeBuffer(data: unknown): string {
  if (data instanceof Uint8Array) return `Uint8Array(${data.length})`;
  if (data instanceof Uint16Array) return `Uint16Array(${data.length})`;
  if (data === undefined || data === null) return String(data);
  return typeof data;
}

/**
 * Documented tonal-distribution check.
 *
 * A pre-screened or binary image carries only the extreme sample values of its
 * bit depth. The gate flags data that uses both extremes and no intermediate
 * value. A uniform image (only one extreme) is not flagged, so a legitimate
 * solid-black or solid-white artwork is not misclassified. The check is
 * deterministic and inspects the whole buffer once.
 */
function hasBinaryTonalDistribution(
  data: Uint8Array | Uint16Array,
  bitDepth: SupportedBitDepth,
): boolean {
  const maximum = MAX_SAMPLE_BY_BIT_DEPTH[bitDepth];
  let sawMinimum = false;
  let sawMaximum = false;

  for (const sample of data) {
    if (sample === 0) {
      sawMinimum = true;
    } else if (sample === maximum) {
      sawMaximum = true;
    } else {
      return false;
    }
  }

  return sawMinimum && sawMaximum;
}

function describePreparedArtwork(
  input: ContinuousToneInput,
  signals: readonly PreparedArtworkSignal[],
  overrides: PreparedArtworkOverrideRecord[],
): Issue[] {
  const structuralSignals = signals.filter(
    (signal) => signal === 'bit-depth' || signal === 'layout',
  );
  const override = input.preparedArtworkOverride;
  const signalList = signals.join(', ');

  if (structuralSignals.length > 0) {
    return [
      createIssue(
        'input.prepared_artwork',
        `Input is not continuous-tone material (signals: ${signalList}); it cannot be screened even with an override.`,
        {
          expected: 'continuous-tone RGB or grayscale raster',
          parameter: 'input',
          details: {
            signals: [...signals],
            structuralSignals: [...structuralSignals],
            overrideAcknowledged: override !== undefined && override.acknowledged === true,
          },
        },
      ),
    ];
  }

  if (override === undefined || override.acknowledged !== true) {
    return [
      createIssue(
        'input.prepared_artwork',
        `Input looks like prepared artwork (signals: ${signalList}). Submit continuous-tone RGB or grayscale material, or acknowledge the prepared-artwork override.`,
        {
          expected: 'continuous-tone RGB or grayscale raster',
          parameter: 'input',
          details: {
            signals: [...signals],
            overridePresent: override !== undefined,
            overrideAcknowledged: false,
          },
        },
      ),
    ];
  }

  const reason: unknown = override.reason;

  if (typeof reason !== 'string' || reason.trim().length === 0) {
    return [
      createIssue(
        'input.prepared_artwork_override_reason_missing',
        'A prepared-artwork override requires a non-empty reason; the acknowledgment was not recorded.',
        {
          offendingValue: toJsonValue(reason),
          expected: 'non-empty reason',
          parameter: 'preparedArtworkOverride.reason',
          details: { signals: [...signals] },
        },
      ),
    ];
  }

  overrides.push({
    kind: 'prepared-artwork',
    reason,
    signals: [...signals],
  });

  return [
    createIssue(
      'input.prepared_artwork_override',
      `Prepared-artwork detection was overridden (signals: ${signalList}); the acknowledgment and its reason are recorded.`,
      {
        expected: 'explicit acknowledgment with a recorded reason',
        parameter: 'preparedArtworkOverride',
        details: {
          signals: [...signals],
          reason: override.reason,
        },
      },
    ),
  ];
}

/**
 * Validates a continuous-tone input. Returns an accepted result with the
 * issues and recorded overrides, or a rejected result that carries no raster
 * data. Pure and synchronous: no host, DOM, I/O or randomness.
 */
export function validateInputContract(input: ContinuousToneInput): InputGateResult {
  const issues: Issue[] = [];
  const signals: PreparedArtworkSignal[] = [];
  const overrides: PreparedArtworkOverrideRecord[] = [];

  const width: unknown = input.width;
  const height: unknown = input.height;
  const dimensionsValid = isPositiveInteger(width) && isPositiveInteger(height);

  if (!dimensionsValid) {
    issues.push(
      createIssue('input.invalid_dimensions', 'Input dimensions must be positive integers.', {
        offendingValue: toJsonValue({ width, height }),
        expected: 'positive integer width and height',
        parameter: 'dimensions',
      }),
    );
  }

  const ppi: unknown = input.ppi;

  if (ppi === undefined || ppi === null) {
    issues.push(
      createIssue('input.ppi_missing', 'Input PPI is required and was not supplied.', {
        expected: 'positive finite number',
        parameter: 'ppi',
      }),
    );
  } else if (typeof ppi !== 'number' || !Number.isFinite(ppi) || ppi <= 0) {
    issues.push(
      createIssue('input.invalid_ppi', 'Input PPI must be a positive finite number.', {
        offendingValue: toJsonValue(ppi),
        expected: 'positive finite number',
        parameter: 'ppi',
      }),
    );
  }

  const bitDepth: unknown = input.bitDepth;
  let supportedBitDepth: SupportedBitDepth | undefined;

  if (bitDepth === 1) {
    signals.push('bit-depth');
  } else if (isSupportedBitDepth(bitDepth)) {
    supportedBitDepth = bitDepth;
  } else {
    issues.push(
      createIssue('input.unsupported_bit_depth', 'Input bit depth must be 8 or 16.', {
        offendingValue: toJsonValue(bitDepth),
        expected: '8 or 16',
        parameter: 'bitDepth',
      }),
    );
  }

  const layout: unknown = input.layout;
  let supportedLayout: SupportedLayout | undefined;

  if (isSupportedLayout(layout)) {
    supportedLayout = layout;
  } else if (isPreparedArtworkLayout(layout)) {
    signals.push('layout');
  } else {
    issues.push(
      createIssue('input.unsupported_layout', 'Input channel layout must be RGB or grayscale.', {
        offendingValue: toJsonValue(layout),
        expected: 'rgb or grayscale',
        parameter: 'layout',
      }),
    );
  }

  if (input.sourceKind === 'prepared-artwork') {
    signals.push('source-kind');
  }

  if (dimensionsValid && supportedBitDepth !== undefined && supportedLayout !== undefined) {
    const expectedSamples = width * height * CHANNELS_BY_LAYOUT[supportedLayout];
    const data: unknown = input.data;
    const buffer = bufferForDepth(data, supportedBitDepth);

    if (buffer === undefined) {
      issues.push(
        createIssue(
          'input.data_size_mismatch',
          'Input data buffer does not match the declared bit depth.',
          {
            offendingValue: describeBuffer(data),
            expected: `${supportedBitDepth}-bit ${
              supportedBitDepth === 8 ? 'Uint8Array' : 'Uint16Array'
            }`,
            parameter: 'data',
            details: { bitDepth: supportedBitDepth, expectedSamples },
          },
        ),
      );
    } else if (buffer.length !== expectedSamples) {
      issues.push(
        createIssue(
          'input.data_size_mismatch',
          'Input data length does not match dimensions, layout and bit depth.',
          {
            offendingValue: buffer.length,
            expected: `${expectedSamples} samples`,
            parameter: 'data',
            details: {
              bitDepth: supportedBitDepth,
              expectedSamples,
              actualSamples: buffer.length,
            },
          },
        ),
      );
    } else if (hasBinaryTonalDistribution(buffer, supportedBitDepth)) {
      signals.push('tonal-distribution');
    }
  }

  if (signals.length > 0) {
    issues.push(...describePreparedArtwork(input, signals, overrides));
  }

  if (resolveOutcomeStatus(issues) === 'rejected') {
    return { status: 'rejected', issues };
  }

  return { status: 'accepted', issues, overrides };
}
