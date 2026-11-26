/**
 * Separation stage for the halftone engine.
 *
 * Separation maps a continuous-tone input onto exactly the ink channels the
 * production profile declares. v1 admits three modes and nothing else:
 * channel-preserving declared mapping, declared linear mixing with an explicit
 * coefficient matrix, and an ICC transform injected by the caller.
 *
 * The stage is pure and synchronous: no host, DOM, I/O, network or randomness.
 * It runs after the input gate, consumes already accepted input, and returns
 * either the produced channels with their transform identities or a rejection
 * that carries no channel data.
 */

import { createIssue, resolveOutcomeStatus, toJsonValue } from './contracts/issue';
import type { Issue } from './contracts/issue';
import {
  CANONICALISATION_VERSION,
  HASH_ALGORITHMS,
  HASH_PATTERN,
  ICC_RENDERING_INTENTS,
  SEPARATION_MODES,
} from './contracts/separation';
import type {
  ChannelPreservingSeparation,
  IccConverter,
  IccSeparation,
  LinearMixingSeparation,
  MaskSource,
  SeparationResult,
  SeparationStageInput,
  SeparationTransferFunction,
  SeparatedChannel,
  TransformIdentity,
} from './contracts/separation';
import type { InkChannel } from './contracts/profile';
import type { BitDepth, ContinuousToneInput, InputLayout } from './contracts/request';

/** Input channel ids per supported layout, in sample order. */
const INPUT_CHANNELS_BY_LAYOUT: Record<InputLayout, readonly string[]> = {
  rgb: ['r', 'g', 'b'],
  grayscale: ['gray'],
};

const MAX_SAMPLE_BY_BIT_DEPTH: Record<BitDepth, number> = {
  8: 0xff,
  16: 0xffff,
};

/** 16-bit unsigned fixed-point upper bound, representing a tonal value of 1. */
const FIXED_POINT_MAX = 0xffff;

/** 8-bit coverage sample scaled exactly to the 16-bit fixed-point range. */
const COVERAGE_SCALE = 0x101;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isHash(value: unknown): value is string {
  return typeof value === 'string' && HASH_PATTERN.test(value);
}

function isSeparationMode(value: unknown): value is string {
  return typeof value === 'string' && (SEPARATION_MODES as readonly string[]).includes(value);
}

function isToneChannel(channel: InkChannel): boolean {
  return channel.dataKind === 'tone';
}

/**
 * Returns every channel id declared more than once. Outputs are keyed by
 * channel id, so a duplicate would silently collapse two declared channels
 * into one row; the stage rejects instead.
 */
function findDuplicateChannelIds(channels: readonly InkChannel[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const channel of channels) {
    const id = (channel as { id?: unknown }).id;
    if (typeof id !== 'string') continue;
    if (seen.has(id)) duplicates.add(id);
    else seen.add(id);
  }

  return [...duplicates];
}

function unidentifiable(parameter: string, message: string, offendingValue?: unknown): Issue {
  return createIssue('separation.unidentifiable_transform', message, {
    offendingValue: offendingValue === undefined ? undefined : toJsonValue(offendingValue),
    expected: 'stable identity and complete, well-formed provenance',
    parameter,
  });
}

/**
 * Validates a transform identity: stable id and version, the declared mode,
 * a SHA-256 parameter hash, the hash algorithm and the canonicalisation
 * version. Caller-supplied hashes are recorded, never attested.
 */
function validateTransformIdentity(identity: TransformIdentity | undefined, mode: string): Issue[] {
  const raw = asRecord(identity);

  if (raw === undefined) {
    return [
      unidentifiable('separation.identity', 'The separation transform has no stable identity.'),
    ];
  }

  const issues: Issue[] = [];

  if (!isNonEmptyString(raw.id)) {
    issues.push(
      unidentifiable(
        'separation.identity.id',
        'The transform identity requires a stable id.',
        raw.id,
      ),
    );
  }
  if (!isNonEmptyString(raw.version)) {
    issues.push(
      unidentifiable(
        'separation.identity.version',
        'The transform identity requires a version.',
        raw.version,
      ),
    );
  }
  if (raw.type !== mode) {
    issues.push(
      unidentifiable(
        'separation.identity.type',
        'The transform identity type must match the declared separation mode.',
        raw.type,
      ),
    );
  }
  if (!isHash(raw.parameterHash)) {
    issues.push(
      unidentifiable(
        'separation.identity.parameterHash',
        'The transform identity requires a lowercase SHA-256 parameter hash.',
        raw.parameterHash,
      ),
    );
  }
  if (raw.hashAlgorithm !== HASH_ALGORITHMS[0]) {
    issues.push(
      unidentifiable(
        'separation.identity.hashAlgorithm',
        'The hash algorithm must be sha256.',
        raw.hashAlgorithm,
      ),
    );
  }
  if (raw.canonicalisationVersion !== CANONICALISATION_VERSION) {
    issues.push(
      unidentifiable(
        'separation.identity.canonicalisationVersion',
        'The transform identity requires the supported canonicalisation version.',
        raw.canonicalisationVersion,
      ),
    );
  }

  return issues;
}

function validateIccProvenance(separation: IccSeparation): Issue[] {
  const provenance = asRecord(separation.provenance);

  if (provenance === undefined) {
    return [
      unidentifiable(
        'separation.provenance',
        'An ICC transform requires source and destination profile provenance.',
      ),
    ];
  }

  const issues: Issue[] = [];
  const requiredText: ReadonlyArray<readonly [string, string]> = [
    ['sourceProfileId', 'source profile id'],
    ['destinationProfileId', 'destination profile id'],
  ];
  const requiredHashes: ReadonlyArray<readonly [string, string]> = [
    ['sourceProfileHash', 'source profile hash'],
    ['destinationProfileHash', 'destination profile hash'],
  ];

  for (const [field, label] of requiredText) {
    if (!isNonEmptyString(provenance[field])) {
      issues.push(
        unidentifiable(
          `separation.provenance.${field}`,
          `An ICC transform requires a ${label}.`,
          provenance[field],
        ),
      );
    }
  }

  for (const [field, label] of requiredHashes) {
    if (!isHash(provenance[field])) {
      issues.push(
        unidentifiable(
          `separation.provenance.${field}`,
          `An ICC transform requires a lowercase SHA-256 ${label}.`,
          provenance[field],
        ),
      );
    }
  }

  if (
    typeof provenance.renderingIntent !== 'string' ||
    !(ICC_RENDERING_INTENTS as readonly string[]).includes(provenance.renderingIntent)
  ) {
    issues.push(
      unidentifiable(
        'separation.provenance.renderingIntent',
        'An ICC transform requires a known rendering intent.',
        provenance.renderingIntent,
      ),
    );
  }

  if (typeof provenance.blackPointCompensation !== 'boolean') {
    issues.push(
      unidentifiable(
        'separation.provenance.blackPointCompensation',
        'An ICC transform requires an explicit black-point-compensation flag.',
        provenance.blackPointCompensation,
      ),
    );
  }

  return issues;
}

/**
 * Validates optional per-channel transfer functions. A transfer function is
 * part of the separation mapping, so its control points must be finite, in
 * `[0, 1]` and strictly increasing in their input.
 */
function validateTransferFunctions(
  transferFunctions: Readonly<Record<string, SeparationTransferFunction>> | undefined,
  toneChannels: readonly InkChannel[],
): Issue[] {
  if (transferFunctions === undefined) return [];

  const raw = asRecord(transferFunctions);

  if (raw === undefined) {
    return [
      createIssue(
        'separation.invalid_transfer_function',
        'Transfer functions must be keyed by ink channel id.',
        {
          expected: 'record of transfer functions keyed by tone channel id',
          parameter: 'separation.transferFunctions',
        },
      ),
    ];
  }

  const toneIds = new Set(toneChannels.map((channel) => channel.id));
  const issues: Issue[] = [];

  for (const [channelId, entry] of Object.entries(raw)) {
    if (!toneIds.has(channelId)) {
      issues.push(
        createIssue(
          'separation.invalid_transfer_function',
          'A transfer function targets an unknown or non-tone channel.',
          {
            offendingValue: channelId,
            expected: 'tone channel id',
            channel: channelId,
            parameter: 'separation.transferFunctions',
          },
        ),
      );
      continue;
    }

    const record = asRecord(entry);

    if (record === undefined) {
      issues.push(
        createIssue(
          'separation.invalid_transfer_function',
          'A transfer function must declare points and interpolation.',
          {
            channel: channelId,
            parameter: 'separation.transferFunctions',
          },
        ),
      );
      continue;
    }

    if (record.interpolation !== 'linear') {
      issues.push(
        createIssue(
          'separation.invalid_transfer_function',
          'Only linear transfer-function interpolation is supported.',
          {
            offendingValue: toJsonValue(record.interpolation),
            expected: 'linear',
            channel: channelId,
            parameter: 'separation.transferFunctions.interpolation',
          },
        ),
      );
    }

    if (!Array.isArray(record.points)) {
      issues.push(
        createIssue(
          'separation.invalid_transfer_function',
          'A transfer function requires an explicit list of control points.',
          {
            channel: channelId,
            parameter: 'separation.transferFunctions.points',
          },
        ),
      );
      continue;
    }

    let previousInput: number | undefined;

    for (const point of record.points as unknown[]) {
      const coordinates = asRecord(point);
      const input = coordinates?.input;
      const output = coordinates?.output;

      if (
        typeof input !== 'number' ||
        !Number.isFinite(input) ||
        input < 0 ||
        input > 1 ||
        typeof output !== 'number' ||
        !Number.isFinite(output) ||
        output < 0 ||
        output > 1
      ) {
        issues.push(
          createIssue(
            'separation.invalid_transfer_function',
            'Transfer-function control points must be finite values in [0, 1].',
            {
              offendingValue: toJsonValue({ input, output }),
              expected: 'finite input and output in [0, 1]',
              channel: channelId,
              parameter: 'separation.transferFunctions.points',
            },
          ),
        );
        continue;
      }

      if (previousInput !== undefined && input <= previousInput) {
        issues.push(
          createIssue(
            'separation.invalid_transfer_function',
            'Transfer-function inputs must be strictly increasing.',
            {
              offendingValue: input,
              expected: 'strictly increasing, unique inputs',
              channel: channelId,
              parameter: 'separation.transferFunctions.points[].input',
            },
          ),
        );
      }

      previousInput = input;
    }
  }

  return issues;
}

function validateChannelPreserving(
  separation: ChannelPreservingSeparation,
  toneChannels: readonly InkChannel[],
  inputChannelIds: readonly string[],
): Issue[] {
  const issues: Issue[] = [...validateTransformIdentity(separation.identity, 'channel-preserving')];

  if (toneChannels.length !== inputChannelIds.length) {
    issues.push(
      createIssue(
        'separation.channel_count_mismatch',
        'Channel-preserving separation requires exactly one tone channel per input channel.',
        {
          offendingValue: {
            inputChannels: inputChannelIds.length,
            toneChannels: toneChannels.length,
          },
          expected: 'one tone channel per input channel',
          parameter: 'profile.channels',
        },
      ),
    );
  }

  const channelMap = asRecord(separation.channelMap);

  if (channelMap === undefined) {
    issues.push(
      createIssue(
        'separation.invalid_mapping',
        'Channel-preserving separation requires an explicit input-to-ink channel map.',
        {
          expected: 'explicit map from each input channel to one ink channel',
          parameter: 'separation.channelMap',
        },
      ),
    );
  } else {
    const toneIds = new Set(toneChannels.map((channel) => channel.id));
    const mappedInputs = new Set(Object.keys(channelMap));
    const mappedTargets = new Set<string>();

    for (const inputChannelId of inputChannelIds) {
      const target = channelMap[inputChannelId];

      if (!isNonEmptyString(target)) {
        issues.push(
          createIssue(
            'separation.invalid_mapping',
            'The channel map does not declare a target for every input channel.',
            {
              offendingValue: toJsonValue(target),
              expected: 'one ink channel id per input channel',
              parameter: `separation.channelMap.${inputChannelId}`,
            },
          ),
        );
        continue;
      }

      if (!toneIds.has(target)) {
        issues.push(
          createIssue(
            'separation.invalid_mapping',
            'The channel map targets an unknown or non-tone ink channel.',
            {
              offendingValue: target,
              expected: 'declared tone channel id',
              channel: target,
              parameter: `separation.channelMap.${inputChannelId}`,
            },
          ),
        );
        continue;
      }

      if (mappedTargets.has(target)) {
        issues.push(
          createIssue(
            'separation.invalid_mapping',
            'Two input channels map to the same ink channel; that is mixing without a declared matrix.',
            {
              offendingValue: target,
              expected: 'one input channel per ink channel',
              channel: target,
              parameter: 'separation.channelMap',
            },
          ),
        );
      }

      mappedTargets.add(target);
    }

    for (const key of mappedInputs) {
      if (!inputChannelIds.includes(key)) {
        issues.push(
          createIssue(
            'separation.invalid_mapping',
            'The channel map declares an input channel the layout does not have.',
            {
              offendingValue: key,
              expected: `input channels: ${inputChannelIds.join(', ')}`,
              parameter: `separation.channelMap.${key}`,
            },
          ),
        );
      }
    }

    for (const channel of toneChannels) {
      if (!mappedTargets.has(channel.id)) {
        issues.push(
          createIssue(
            'separation.invalid_mapping',
            'A declared tone channel is not produced by the channel map.',
            {
              expected: 'one mapped input channel per tone channel',
              channel: channel.id,
              parameter: 'separation.channelMap',
            },
          ),
        );
      }
    }
  }

  issues.push(...validateTransferFunctions(separation.transferFunctions, toneChannels));

  return issues;
}

function validateLinearMixing(
  separation: LinearMixingSeparation,
  toneChannels: readonly InkChannel[],
  inputChannelIds: readonly string[],
): Issue[] {
  const issues: Issue[] = [...validateTransformIdentity(separation.identity, 'linear-mixing')];
  const matrix = separation.matrix as unknown;

  if (!Array.isArray(matrix)) {
    issues.push(
      createIssue(
        'separation.invalid_matrix',
        'Declared linear mixing requires an explicit matrix.',
        {
          expected: `${toneChannels.length} rows x ${inputChannelIds.length} columns`,
          parameter: 'separation.matrix',
        },
      ),
    );
    return issues;
  }

  if (matrix.length !== toneChannels.length) {
    issues.push(
      createIssue(
        'separation.invalid_matrix',
        'The mixing matrix must declare one row per tone channel.',
        {
          offendingValue: matrix.length,
          expected: `${toneChannels.length} rows`,
          parameter: 'separation.matrix',
        },
      ),
    );
  }

  matrix.forEach((row: unknown, rowIndex: number) => {
    if (!Array.isArray(row)) {
      issues.push(
        createIssue(
          'separation.invalid_matrix',
          'Every matrix row must be an explicit coefficient list.',
          {
            offendingValue: toJsonValue(row),
            expected: `${inputChannelIds.length} finite coefficients`,
            parameter: `separation.matrix[${rowIndex}]`,
          },
        ),
      );
      return;
    }

    if (row.length !== inputChannelIds.length) {
      issues.push(
        createIssue(
          'separation.invalid_matrix',
          'A matrix row has the wrong number of coefficients.',
          {
            offendingValue: row.length,
            expected: `${inputChannelIds.length} columns`,
            channel: toneChannels[rowIndex]?.id,
            parameter: `separation.matrix[${rowIndex}]`,
          },
        ),
      );
    }

    row.forEach((coefficient: unknown, columnIndex: number) => {
      if (typeof coefficient !== 'number' || !Number.isFinite(coefficient)) {
        issues.push(
          createIssue('separation.invalid_matrix', 'Matrix coefficients must be finite numbers.', {
            offendingValue: toJsonValue(coefficient),
            expected: 'finite number',
            channel: toneChannels[rowIndex]?.id,
            parameter: `separation.matrix[${rowIndex}][${columnIndex}]`,
          }),
        );
      }
    });
  });

  issues.push(...validateTransferFunctions(separation.transferFunctions, toneChannels));

  return issues;
}

function validateIcc(separation: IccSeparation, converter: IccConverter | undefined): Issue[] {
  const issues: Issue[] = [
    ...validateTransformIdentity(separation.identity, 'icc'),
    ...validateIccProvenance(separation),
  ];

  if (typeof converter !== 'function') {
    issues.push(
      unidentifiable(
        'separation.iccConverter',
        'An ICC separation requires a caller-injected pure converter; an opaque transform is never reproducible.',
      ),
    );
  }

  return issues;
}

function validateMaskSources(
  input: ContinuousToneInput,
  maskChannels: readonly InkChannel[],
  maskSources: readonly MaskSource[] | undefined,
): { issues: Issue[]; sources: Map<string, MaskSource> } {
  const issues: Issue[] = [];
  const sources = new Map<string, MaskSource>();
  const declared = maskSources ?? [];
  const maskIds = new Set(maskChannels.map((channel) => channel.id));
  const declaredIds = new Set<string>();

  for (const source of declared) {
    const channelId = asRecord(source)?.channelId;

    if (typeof channelId === 'string' && declaredIds.has(channelId)) {
      issues.push(
        createIssue('separation.mask_source_invalid', 'Two mask sources target the same channel.', {
          offendingValue: channelId,
          expected: 'one explicit mask source per mask channel',
          channel: channelId,
          parameter: 'maskSources',
        }),
      );
    }

    if (typeof channelId === 'string') declaredIds.add(channelId);
  }

  for (const channel of maskChannels) {
    const source = declared.find((entry) => asRecord(entry)?.channelId === channel.id);

    if (source === undefined) {
      issues.push(
        createIssue(
          'separation.mask_source_missing',
          'A mask channel requires an explicit mask source; automatic white generation is not available.',
          {
            expected: 'explicit mask source for every mask channel',
            channel: channel.id,
            parameter: 'maskSources',
          },
        ),
      );
      continue;
    }

    const record = asRecord(source) ?? {};
    const data = record.data;
    const valid =
      isNonEmptyString(record.identity) &&
      record.width === input.width &&
      record.height === input.height &&
      data instanceof Uint8Array &&
      data.length === input.width * input.height;

    if (!valid) {
      issues.push(
        createIssue('separation.mask_source_invalid', 'The mask source is malformed.', {
          offendingValue: toJsonValue({
            identity: record.identity,
            width: record.width,
            height: record.height,
            samples: data instanceof Uint8Array ? data.length : typeof data,
          }),
          expected: `non-empty identity and ${input.width} x ${input.height} coverage samples`,
          channel: channel.id,
          parameter: 'maskSources',
        }),
      );
      continue;
    }

    sources.set(channel.id, source);
  }

  for (const source of declared) {
    const channelId = asRecord(source)?.channelId;
    if (typeof channelId !== 'string' || !maskIds.has(channelId)) {
      issues.push(
        createIssue(
          'separation.mask_source_invalid',
          'A mask source targets an unknown or non-mask channel.',
          {
            offendingValue: toJsonValue(channelId),
            expected: 'declared mask channel id',
            parameter: 'maskSources',
          },
        ),
      );
    }
  }

  return { issues, sources };
}

/**
 * Reads the accepted input into normalized `[0, 1]` samples per input channel.
 * Returns `undefined` when the input does not satisfy the input-gate
 * precondition, so the stage rejects instead of throwing.
 */
function readInputChannels(input: ContinuousToneInput): number[][] | undefined {
  const { width, height, layout, bitDepth } = input;

  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    return undefined;
  }

  const channelIds = INPUT_CHANNELS_BY_LAYOUT[layout];
  const maximum = MAX_SAMPLE_BY_BIT_DEPTH[bitDepth];
  const data: unknown = input.data;

  if (channelIds === undefined || maximum === undefined) return undefined;

  let samples: Uint8Array | Uint16Array;
  if (bitDepth === 8) {
    if (!(data instanceof Uint8Array)) return undefined;
    samples = data;
  } else {
    if (!(data instanceof Uint16Array)) return undefined;
    samples = data;
  }

  const samplesPerChannel = width * height;
  if (samples.length !== samplesPerChannel * channelIds.length) return undefined;

  const channels: number[][] = channelIds.map(() => new Array<number>(samplesPerChannel).fill(0));

  for (let index = 0; index < samplesPerChannel; index += 1) {
    for (let channelIndex = 0; channelIndex < channelIds.length; channelIndex += 1) {
      const sample = samples[index * channelIds.length + channelIndex] ?? 0;
      const channel = channels[channelIndex];
      if (channel !== undefined) channel[index] = sample / maximum;
    }
  }

  return channels;
}

function toFixedPoint(value: number): number {
  const clamped = value < 0 ? 0 : value > 1 ? 1 : value;
  return Math.floor(clamped * FIXED_POINT_MAX + 0.5);
}

/** Linear interpolation clamped to the endpoint outputs outside the domain. */
function evaluateTransferFunction(
  value: number,
  transferFunction: SeparationTransferFunction | undefined,
): number {
  if (transferFunction === undefined) return value;

  const points = transferFunction.points;
  const first = points[0];
  const last = points[points.length - 1];

  if (first === undefined || last === undefined) return value;
  if (value <= first.input) return first.output;
  if (value >= last.input) return last.output;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (previous === undefined || current === undefined) continue;
    if (value <= current.input) {
      const span = current.input - previous.input;
      if (span <= 0) return current.output;
      const ratio = (value - previous.input) / span;
      return previous.output + ratio * (current.output - previous.output);
    }
  }

  return last.output;
}

function applyChannelPreserving(
  separation: ChannelPreservingSeparation,
  inputChannels: readonly number[][],
  inputChannelIds: readonly string[],
  toneChannels: readonly InkChannel[],
): Uint16Array[] {
  const sourceByTarget = new Map<string, number>();

  for (const inputChannelId of inputChannelIds) {
    const target = separation.channelMap[inputChannelId];
    const sourceIndex = inputChannelIds.indexOf(inputChannelId);
    if (target === undefined || sourceIndex < 0) continue;
    sourceByTarget.set(target, sourceIndex);
  }

  return toneChannels.map((channel) => {
    const sourceIndex = sourceByTarget.get(channel.id);
    const source = sourceIndex === undefined ? undefined : inputChannels[sourceIndex];
    const transferFunction = separation.transferFunctions?.[channel.id];

    if (source === undefined) return new Uint16Array(0);

    const output = new Uint16Array(source.length);
    for (let index = 0; index < source.length; index += 1) {
      const value = source[index] ?? 0;
      output[index] = toFixedPoint(evaluateTransferFunction(value, transferFunction));
    }
    return output;
  });
}

function applyLinearMixing(
  separation: LinearMixingSeparation,
  inputChannels: readonly number[][],
  toneChannels: readonly InkChannel[],
): Uint16Array[] {
  return toneChannels.map((channel, rowIndex) => {
    const row = separation.matrix[rowIndex] ?? [];
    const transferFunction = separation.transferFunctions?.[channel.id];
    const sampleCount = inputChannels[0]?.length ?? 0;
    const output = new Uint16Array(sampleCount);

    for (let index = 0; index < sampleCount; index += 1) {
      let mixed = 0;
      for (let column = 0; column < row.length; column += 1) {
        mixed += (row[column] ?? 0) * (inputChannels[column]?.[index] ?? 0);
      }
      output[index] = toFixedPoint(evaluateTransferFunction(mixed, transferFunction));
    }

    return output;
  });
}

function applyIcc(
  converter: IccConverter,
  input: ContinuousToneInput,
  inputChannels: readonly number[][],
  toneChannels: readonly InkChannel[],
): { issues: Issue[]; data: Uint16Array[] } {
  const sampleCount = input.width * input.height;
  const issues: Issue[] = [];

  let result: unknown;
  try {
    result = converter({
      width: input.width,
      height: input.height,
      layout: input.layout,
      channels: inputChannels,
    });
  } catch (error) {
    issues.push(
      createIssue('separation.invalid_transform_output', 'The injected ICC converter failed.', {
        offendingValue: toJsonValue(error instanceof Error ? error.message : error),
        expected: 'pure, deterministic conversion without throwing',
        parameter: 'separation.iccConverter',
      }),
    );
    return { issues, data: [] };
  }

  if (!Array.isArray(result) || result.length !== toneChannels.length) {
    issues.push(
      createIssue(
        'separation.invalid_transform_output',
        'The ICC converter must return one channel per declared tone channel.',
        {
          offendingValue: Array.isArray(result) ? result.length : typeof result,
          expected: `${toneChannels.length} channels`,
          parameter: 'separation.iccConverter',
        },
      ),
    );
    return { issues, data: [] };
  }

  const data: Uint16Array[] = [];

  result.forEach((channel: unknown, channelIndex: number) => {
    const toneChannel = toneChannels[channelIndex];

    if (!Array.isArray(channel) || channel.length !== sampleCount) {
      issues.push(
        createIssue(
          'separation.invalid_transform_output',
          'The ICC converter returned a channel with the wrong sample count.',
          {
            offendingValue: Array.isArray(channel) ? channel.length : typeof channel,
            expected: `${sampleCount} samples`,
            channel: toneChannel?.id,
            parameter: 'separation.iccConverter',
          },
        ),
      );
      return;
    }

    const output = new Uint16Array(sampleCount);
    let valid = true;

    channel.forEach((value: unknown, index: number) => {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
        if (valid) {
          issues.push(
            createIssue(
              'separation.invalid_transform_output',
              'The ICC converter returned a value outside the normalized tonal range.',
              {
                offendingValue: toJsonValue(value),
                expected: 'finite value in [0, 1]',
                channel: toneChannel?.id,
                parameter: `separation.iccConverter[${channelIndex}][${index}]`,
              },
            ),
          );
        }
        valid = false;
        return;
      }
      output[index] = toFixedPoint(value);
    });

    if (valid) data.push(output);
  });

  return { issues, data };
}

/**
 * Validates and executes separation. The stage consumes input that already
 * passed the input gate; a malformed input is rejected rather than thrown on.
 * Returns exactly the channels the profile declares, each with the identity of
 * the transform that produced it, or a rejection with no channel data.
 */
export function separate<TProcessAttributes = never>(
  stage: SeparationStageInput<TProcessAttributes>,
): SeparationResult {
  const issues: Issue[] = [];
  const input = stage.input;
  const profile = stage.profile;
  const rawChannels: unknown = profile.channels;

  if (!Array.isArray(rawChannels)) {
    issues.push(
      createIssue(
        'separation.invalid_input',
        'Separation requires a profile that declares an explicit channel list.',
        {
          offendingValue: toJsonValue(rawChannels),
          expected: 'explicit list of declared ink channels',
          parameter: 'profile.channels',
        },
      ),
    );
    return { status: 'rejected', issues };
  }

  if (rawChannels.length === 0) {
    issues.push(
      createIssue('separation.channel_count_mismatch', 'The profile declares no ink channels.', {
        offendingValue: 0,
        expected: 'at least one declared ink channel',
        parameter: 'profile.channels',
      }),
    );
    return { status: 'rejected', issues };
  }

  const channels = rawChannels as readonly InkChannel[];
  const duplicateIds = findDuplicateChannelIds(channels);

  if (duplicateIds.length > 0) {
    issues.push(
      createIssue(
        'separation.channel_count_mismatch',
        'The profile declares duplicate channel ids; each ink channel must be unique.',
        {
          offendingValue: duplicateIds,
          expected: 'unique channel ids',
          parameter: 'profile.channels[].id',
        },
      ),
    );
    return { status: 'rejected', issues };
  }

  if (stage.maskSources !== undefined && !Array.isArray(stage.maskSources)) {
    issues.push(
      createIssue('separation.invalid_input', 'Mask sources must be an explicit list.', {
        offendingValue: toJsonValue(stage.maskSources),
        expected: 'list of explicit mask sources',
        parameter: 'maskSources',
      }),
    );
    return { status: 'rejected', issues };
  }

  const toneChannels = channels.filter(isToneChannel);
  const maskChannels = channels.filter((channel) => channel.dataKind === 'mask');

  const inputChannels = readInputChannels(input);

  if (inputChannels === undefined) {
    issues.push(
      createIssue(
        'separation.invalid_input',
        'Separation requires an input that already passed the input gate.',
        {
          expected: 'accepted continuous-tone input with matching dimensions and samples',
          parameter: 'input',
        },
      ),
    );
    return { status: 'rejected', issues };
  }

  const inputChannelIds = INPUT_CHANNELS_BY_LAYOUT[input.layout] ?? [];

  const maskValidation = validateMaskSources(input, maskChannels, stage.maskSources);
  issues.push(...maskValidation.issues);

  const declaration = profile.separation;
  let toneData: Uint16Array[] = [];

  if (declaration === undefined) {
    if (toneChannels.length > 0) {
      issues.push(
        createIssue(
          'separation.undeclared_mapping',
          'The profile declares tone channels but no separation; implicit RGB-to-CMYK or RGB-to-N conversion is not performed.',
          {
            expected:
              'declared channel-preserving mapping, declared linear mixing or an injected ICC transform',
            parameter: 'profile.separation',
          },
        ),
      );
    }
  } else {
    const declarationRecord = asRecord(declaration);
    const mode = declarationRecord?.mode;

    if (!isSeparationMode(mode)) {
      issues.push(
        createIssue(
          'separation.invalid_mapping',
          'The declared separation mode is not supported.',
          {
            offendingValue: toJsonValue(mode),
            expected: SEPARATION_MODES.join(', '),
            parameter: 'profile.separation.mode',
          },
        ),
      );
    } else if (mode === 'channel-preserving') {
      issues.push(
        ...validateChannelPreserving(
          declaration as ChannelPreservingSeparation,
          toneChannels,
          inputChannelIds,
        ),
      );
    } else if (mode === 'linear-mixing') {
      issues.push(
        ...validateLinearMixing(
          declaration as LinearMixingSeparation,
          toneChannels,
          inputChannelIds,
        ),
      );
    } else {
      issues.push(...validateIcc(declaration as IccSeparation, stage.iccConverter));
    }
  }

  if (resolveOutcomeStatus(issues) === 'rejected') {
    return { status: 'rejected', issues };
  }

  if (declaration !== undefined) {
    const mode = asRecord(declaration)?.mode;

    if (mode === 'channel-preserving') {
      toneData = applyChannelPreserving(
        declaration as ChannelPreservingSeparation,
        inputChannels,
        inputChannelIds,
        toneChannels,
      );
    } else if (mode === 'linear-mixing') {
      toneData = applyLinearMixing(
        declaration as LinearMixingSeparation,
        inputChannels,
        toneChannels,
      );
    } else if (mode === 'icc' && stage.iccConverter !== undefined) {
      const icc = applyIcc(stage.iccConverter, input, inputChannels, toneChannels);
      issues.push(...icc.issues);
      toneData = icc.data;
    }
  }

  if (resolveOutcomeStatus(issues) === 'rejected') {
    return { status: 'rejected', issues };
  }

  const toneDataById = new Map<string, Uint16Array>();
  toneChannels.forEach((channel, index) => {
    const data = toneData[index];
    if (data !== undefined) toneDataById.set(channel.id, data);
  });

  const transformIdentity =
    declaration === undefined ? undefined : asRecord(declaration.identity)?.id;

  const separated: SeparatedChannel[] = [];

  for (const channel of channels) {
    if (channel.dataKind === 'mask') {
      const source = maskValidation.sources.get(channel.id);
      if (source === undefined) continue;
      const data = new Uint16Array(source.data.length);
      for (let index = 0; index < source.data.length; index += 1) {
        data[index] = (source.data[index] ?? 0) * COVERAGE_SCALE;
      }
      separated.push({
        id: channel.id,
        role: channel.role,
        dataKind: channel.dataKind,
        transformIdentity: source.identity,
        data,
      });
      continue;
    }

    const data = toneDataById.get(channel.id);
    if (data === undefined) continue;
    separated.push({
      id: channel.id,
      role: channel.role,
      dataKind: channel.dataKind,
      transformIdentity: typeof transformIdentity === 'string' ? transformIdentity : 'unknown',
      data,
    });
  }

  if (separated.length !== channels.length) {
    issues.push(
      createIssue(
        'separation.channel_count_mismatch',
        'Separation did not produce exactly the declared channel set.',
        {
          offendingValue: separated.length,
          expected: `${channels.length} channels`,
          parameter: 'profile.channels',
        },
      ),
    );
    return { status: 'rejected', issues };
  }

  return {
    status: 'accepted',
    issues,
    channels: separated,
    transforms: declaration === undefined ? [] : [declaration],
  };
}
