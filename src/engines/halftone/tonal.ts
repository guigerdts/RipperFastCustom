/**
 * Tonal chain for the halftone engine.
 *
 * Each tone channel exposes three ordered tonal stages after separation:
 *
 * 1. `commanded` — the 16-bit fixed-point value produced by separation, kept
 *    verbatim.
 * 2. `corrected` — the commanded value after the channel TRC.
 * 3. `reproducible` — the corrected value after the channel reproduction
 *    limits.
 *
 * The fourth conceptual stage, the screening result, is produced later by the
 * screening stage; the trace carries its slot so the four-stage chain is
 * auditable without being computed here.
 *
 * The stage is pure and synchronous: no host, DOM, I/O, network or randomness.
 * An identity TRC and identity limits are recorded as stages, never skipped.
 * Tonal values are 16-bit unsigned fixed-point in `[0, 1]`; every conversion
 * uses a single `round-half-up` rule, `floor(x * 65535 + 0.5)`.
 */

import { createIssue, resolveOutcomeStatus, toJsonValue } from './contracts/issue';
import type { Issue } from './contracts/issue';
import type {
  ReproductionLimits,
  TonalChannelInput,
  TonalChannelResult,
  TonalChainResult,
  TonalStageSummary,
  TonalTrace,
  TonalTraceEntry,
  TonalTraceOptions,
  TonalTraceRequest,
  ToneReproductionCurve,
  TrcControlPoint,
} from './contracts/tonal';
import { validateReproductionLimits, validateTrcControlPoints } from './contracts/validation';

/** 16-bit unsigned fixed-point upper bound, representing a tonal value of 1. */
const FIXED_POINT_MAX = 0xffff;

/** Frozen identity control points so the recorded identity stage cannot be mutated. */
const IDENTITY_POINTS: readonly TrcControlPoint[] = Object.freeze([
  Object.freeze({ input: 0, output: 0 }),
  Object.freeze({ input: 1, output: 1 }),
]);

/** The identity TRC recorded when a channel declares none. */
export const IDENTITY_TRC: ToneReproductionCurve = Object.freeze({
  points: IDENTITY_POINTS,
  interpolation: 'linear',
});

/** The identity limits recorded when a channel declares none. */
export const IDENTITY_LIMITS: ReproductionLimits = Object.freeze({ a_wf: 0, a_vf: 1 });

/**
 * Copies a TRC into a fresh snapshot so the recorded stage is independent of the
 * caller's object. Mutating the input after the run must never change how the
 * run is interpreted (spec §5/§9 audit invariant).
 */
function copyTrc(trc: ToneReproductionCurve): ToneReproductionCurve {
  return {
    points: trc.points.map((point) => ({ input: point.input, output: point.output })),
    interpolation: trc.interpolation,
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function toFixedPoint(value: number): number {
  const clamped = value < 0 ? 0 : value > 1 ? 1 : value;
  return Math.floor(clamped * FIXED_POINT_MAX + 0.5);
}

function decode(value: number): number {
  return value / FIXED_POINT_MAX;
}

/**
 * Evaluates a TRC at a normalized input with linear interpolation. Inputs
 * outside the control-point domain clamp to the endpoint outputs. An empty
 * point list is an explicit identity curve.
 */
function evaluateTrc(value: number, trc: ToneReproductionCurve): number {
  const points = trc.points;
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

/**
 * Applies reproduction limits after the TRC. The v1 semantics are a linear
 * remap of the corrected value with clamping at both critical areas.
 */
function applyLimits(value: number, limits: ReproductionLimits): number {
  const { a_wf, a_vf } = limits;
  if (value <= a_wf) return 0;
  if (value >= a_vf) return 1;
  const span = a_vf - a_wf;
  if (span <= 0) return value >= a_vf ? 1 : 0;
  return (value - a_wf) / span;
}

function summarize(values: Uint16Array): TonalStageSummary {
  let minimum = FIXED_POINT_MAX;
  let maximum = 0;
  let total = 0;
  let atZero = 0;
  let atOne = 0;

  for (const value of values) {
    if (value < minimum) minimum = value;
    if (value > maximum) maximum = value;
    total += value;
    if (value === 0) atZero += 1;
    if (value === FIXED_POINT_MAX) atOne += 1;
  }

  const count = values.length;
  return {
    min: decode(minimum),
    max: decode(maximum),
    mean: count === 0 ? 0 : decode(total / count),
    atZero,
    atOne,
  };
}

/**
 * A bounded summary of a rejected container value. Reporting the full value
 * would expand a whole-image buffer entry-by-entry on the rejection path, which
 * the spec's memory bound forbids; only the kind and length are needed.
 */
function describeContainer(value: unknown): { kind: string; length: number | null } {
  const kind = Array.isArray(value)
    ? 'Array'
    : value === null
      ? 'null'
      : value instanceof Uint8Array
        ? 'Uint8Array'
        : typeof value;
  const length =
    typeof value === 'object' &&
    value !== null &&
    'length' in value &&
    typeof (value as { length: unknown }).length === 'number'
      ? (value as { length: number }).length
      : null;
  return { kind, length };
}

function invalidInput(parameter: string, message: string, offendingValue?: unknown): Issue {
  return createIssue('channel.tonal_input_invalid', message, {
    offendingValue: offendingValue === undefined ? undefined : toJsonValue(offendingValue),
    expected: '16-bit fixed-point tone channels with at least one sample',
    parameter,
  });
}

/**
 * Validates one channel's TRC and limits, reusing the shared contract
 * validators so the stage emits the same canonical codes as profile
 * validation. Absent limits record identity and emit the informational
 * warning; absent TRC records identity without a warning.
 */
function validateChannelStages(channel: TonalChannelInput, index: number): Issue[] {
  const issues: Issue[] = [];
  const raw = asRecord(channel);

  if (raw === undefined) {
    return [invalidInput(`channels[${index}]`, 'A tone channel must be an object.')];
  }

  if (!isNonEmptyString(raw.id)) {
    issues.push(
      invalidInput(`channels[${index}].id`, 'A tone channel requires a stable id.', raw.id),
    );
  }

  if (!(raw.commanded instanceof Uint16Array)) {
    issues.push(
      invalidInput(
        `channels[${index}].commanded`,
        'The commanded stage must be a 16-bit fixed-point array.',
        describeContainer(raw.commanded),
      ),
    );
  } else if (raw.commanded.length === 0) {
    issues.push(
      invalidInput(
        `channels[${index}].commanded`,
        'A tone channel requires at least one sample.',
        raw.commanded.length,
      ),
    );
  }

  if (channel.trc !== undefined) {
    const trcRecord = asRecord(channel.trc);
    if (trcRecord === undefined || !Array.isArray(trcRecord.points)) {
      issues.push(
        invalidInput(
          `channels[${index}].trc`,
          'A declared TRC requires an explicit list of control points.',
        ),
      );
    } else if (trcRecord.points.some((point) => asRecord(point) === undefined)) {
      issues.push(
        invalidInput(
          `channels[${index}].trc.points`,
          'Every TRC control point must be an object with input and output.',
        ),
      );
    } else {
      issues.push(...validateTrcControlPoints(channel.trc.points));
    }
  }

  if (channel.limits !== undefined) {
    if (asRecord(channel.limits) === undefined) {
      issues.push(
        invalidInput(
          `channels[${index}].limits`,
          'Reproduction limits must be an object with a_wf and a_vf.',
        ),
      );
    } else {
      issues.push(...validateReproductionLimits(channel.limits));
    }
  } else {
    issues.push(
      createIssue(
        'channel.limits_identity',
        'No reproduction limits configured; identity applied',
        {
          expected: 'declared a_wf and a_vf',
          channel: isNonEmptyString(raw.id) ? raw.id : undefined,
          parameter: 'limits',
        },
      ),
    );
  }

  return issues;
}

/**
 * Applies the tonal chain to every channel. Returns exactly the channels it
 * was given, each carrying all three computed stages plus the effective TRC and
 * limits, or a rejection with no channel data.
 */
export function applyTonalChain(stage: {
  readonly channels: readonly TonalChannelInput[];
}): TonalChainResult {
  const issues: Issue[] = [];
  const rawChannels: unknown = asRecord(stage)?.channels;

  if (!Array.isArray(rawChannels)) {
    issues.push(
      invalidInput(
        'channels',
        'The tonal chain requires an explicit list of tone channels.',
        rawChannels,
      ),
    );
    return { status: 'rejected', issues };
  }

  const channels = rawChannels as readonly TonalChannelInput[];

  channels.forEach((channel, index) => {
    issues.push(...validateChannelStages(channel, index));
  });

  if (resolveOutcomeStatus(issues) === 'rejected') {
    return { status: 'rejected', issues };
  }

  const results: TonalChannelResult[] = channels.map((channel) => {
    const effectiveTrc = channel.trc ?? IDENTITY_TRC;
    const effectiveLimits = channel.limits ?? IDENTITY_LIMITS;
    const commanded = channel.commanded;
    const corrected = new Uint16Array(commanded.length);
    const reproducible = new Uint16Array(commanded.length);

    for (let index = 0; index < commanded.length; index += 1) {
      const commandedValue = decode(commanded[index] ?? 0);
      const correctedValue = evaluateTrc(commandedValue, effectiveTrc);
      const correctedFixed = toFixedPoint(correctedValue);
      corrected[index] = correctedFixed;

      const reproducibleValue = applyLimits(decode(correctedFixed), effectiveLimits);
      reproducible[index] = toFixedPoint(reproducibleValue);
    }

    return {
      id: channel.id,
      commanded,
      corrected,
      reproducible,
      trc: copyTrc(effectiveTrc),
      trcApplied: channel.trc !== undefined,
      limits: { a_wf: effectiveLimits.a_wf, a_vf: effectiveLimits.a_vf },
      limitsApplied: channel.limits !== undefined,
      summaries: {
        commanded: summarize(commanded),
        corrected: summarize(corrected),
        reproducible: summarize(reproducible),
      },
    };
  });

  return { status: 'accepted', issues, channels: results };
}

/** Expands a rectangular sample region against a row stride, row-major. */
function expandRegion(region: TonalTraceRequest['region'], stride: number): number[] {
  if (region === undefined) return [];
  const indices: number[] = [];
  for (let row = 0; row < region.height; row += 1) {
    for (let column = 0; column < region.width; column += 1) {
      indices.push((region.y + row) * stride + (region.x + column));
    }
  }
  return indices;
}

/**
 * Produces the four-stage trace for the requested samples or region. The three
 * tonal stages come from the computed channel; the screening-result slot is
 * filled from the injected resolver when present, otherwise it is `null`. The
 * slot is always present so the fourth stage is never omitted.
 */
export function traceTonalChain(
  channel: TonalChannelResult,
  request: TonalTraceRequest,
  options: TonalTraceOptions = {},
): TonalTrace {
  const stride = request.stride;
  const indices =
    request.samples ??
    (stride !== undefined && stride > 0 ? expandRegion(request.region, stride) : []);

  const length = channel.commanded.length;
  const entries: TonalTraceEntry[] = [];

  for (const index of indices) {
    if (!Number.isInteger(index) || index < 0 || index >= length) continue;

    const commanded = decode(channel.commanded[index] ?? 0);
    const corrected = decode(channel.corrected[index] ?? 0);
    const reproducible = decode(channel.reproducible[index] ?? 0);
    const resolved = options.screeningResultAt?.(index);

    entries.push({
      index,
      commanded,
      corrected,
      reproducible,
      screeningResult:
        typeof resolved === 'number' && Number.isFinite(resolved) && resolved >= 0 && resolved <= 1
          ? resolved
          : null,
    });
  }

  return { channelId: channel.id, entries };
}
