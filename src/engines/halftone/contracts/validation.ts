import { createIssue, toJsonValue } from './issue';
import type { Issue } from './issue';
import { DOT_SHAPES } from './screening';
import type { DotShape, ScreeningConfiguration } from './screening';
import { WHITE_ROLE } from './profile';
import type { InkChannel, ProductionProfile } from './profile';
import type { ReproductionLimits, TrcControlPoint } from './tonal';

/** True for a finite number; rejects NaN, infinities and non-numbers. */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** True for a finite number inside the normalized [0, 1] range. */
export function isNormalizedValue(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value <= 1;
}

/**
 * Validates TRC control points. Inputs must be strictly increasing and unique
 * (duplicates or non-increasing inputs are ambiguous). A non-monotonic output
 * is reported as informational only; v1 does not enforce output monotonicity.
 */
export function validateTrcControlPoints(points: readonly TrcControlPoint[]): Issue[] {
  const issues: Issue[] = [];
  let previousInput: number | undefined;

  for (const point of points) {
    // Input range, output range and input ordering are independent diagnoses: an
    // invalid output must never hide a duplicate or disordered input, and an
    // invalid coordinate never suppresses another diagnostic.
    if (!isNormalizedValue(point.input)) {
      issues.push(
        createIssue('channel.trc_out_of_range', 'TRC control-point input outside [0, 1]', {
          offendingValue: { input: point.input },
          expected: 'input in [0, 1]',
          parameter: 'trc.points[].input',
        }),
      );
    }
    if (!isNormalizedValue(point.output)) {
      issues.push(
        createIssue('channel.trc_out_of_range', 'TRC control-point output outside [0, 1]', {
          offendingValue: { output: point.output },
          expected: 'output in [0, 1]',
          parameter: 'trc.points[].output',
        }),
      );
    }
    if (isFiniteNumber(point.input)) {
      if (previousInput !== undefined && point.input <= previousInput) {
        issues.push(
          createIssue(
            'channel.trc_ambiguous',
            'TRC control-point inputs must be strictly increasing',
            {
              offendingValue: point.input,
              expected: 'strictly increasing, unique inputs',
              parameter: 'trc.points[].input',
            },
          ),
        );
      }
      previousInput = point.input;
    }
  }

  if (hasNonMonotonicOutput(points)) {
    issues.push(
      createIssue('channel.trc_non_monotonic', 'TRC output decreases between control points', {
        expected: 'non-decreasing output (informational)',
        parameter: 'trc.points',
      }),
    );
  }

  return issues;
}

function hasNonMonotonicOutput(points: readonly TrcControlPoint[]): boolean {
  let previous = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    if (!isNormalizedValue(point.output)) continue;
    if (point.output < previous) return true;
    previous = point.output;
  }
  return false;
}

/** Validates that limits are finite, in [0, 1] and satisfy `a_wf < a_vf`. */
export function validateReproductionLimits(limits: ReproductionLimits): Issue[] {
  if (!isNormalizedValue(limits.a_wf) || !isNormalizedValue(limits.a_vf)) {
    return [
      createIssue('channel.limits_invalid', 'Reproduction limits must be finite and in [0, 1]', {
        offendingValue: { a_wf: limits.a_wf, a_vf: limits.a_vf },
        expected: 'finite values in [0, 1]',
        parameter: 'limits',
      }),
    ];
  }
  if (limits.a_wf >= limits.a_vf) {
    return [
      createIssue(
        'channel.limits_invalid',
        'Highlight limit must be strictly less than shadow limit',
        {
          offendingValue: { a_wf: limits.a_wf, a_vf: limits.a_vf },
          expected: 'a_wf < a_vf',
          parameter: 'limits',
        },
      ),
    ];
  }
  return [];
}

/** Validates a screening configuration against the method it declares. */
export function validateScreeningConfiguration(config: ScreeningConfiguration): Issue[] {
  if (config.method !== 'am') {
    return [
      createIssue('profile.unsupported_method', `Unsupported screening method: ${config.method}`, {
        offendingValue: config.method,
        expected: 'am',
        parameter: 'screening.method',
      }),
    ];
  }
  return validateAmScreening(config);
}

function validateAmScreening(config: ScreeningConfiguration): Issue[] {
  const issues: Issue[] = [];
  const raw = config as { frequency?: unknown; angle?: unknown; dotShape?: unknown };

  if (raw.frequency === undefined) {
    issues.push(
      createIssue('profile.missing_am_parameter', 'AM screening requires a frequency', {
        expected: 'finite LPI > 0',
        parameter: 'frequency',
      }),
    );
  } else if (!isFiniteNumber(raw.frequency) || raw.frequency <= 0) {
    issues.push(
      createIssue('profile.invalid_am_parameter', 'AM frequency must be finite and positive', {
        offendingValue: toJsonValue(raw.frequency),
        expected: 'finite LPI > 0',
        parameter: 'frequency',
      }),
    );
  }

  if (raw.angle === undefined) {
    issues.push(
      createIssue('profile.missing_am_parameter', 'AM screening requires an angle', {
        expected: 'finite degrees',
        parameter: 'angle',
      }),
    );
  } else if (!isFiniteNumber(raw.angle)) {
    issues.push(
      createIssue('profile.invalid_am_parameter', 'AM angle must be finite', {
        offendingValue: toJsonValue(raw.angle),
        expected: 'finite degrees',
        parameter: 'angle',
      }),
    );
  }

  if (raw.dotShape === undefined) {
    issues.push(
      createIssue('profile.missing_am_parameter', 'AM screening requires a dot shape', {
        expected: DOT_SHAPES.join(', '),
        parameter: 'dotShape',
      }),
    );
  } else if (!isDotShape(raw.dotShape)) {
    issues.push(
      createIssue('profile.invalid_am_parameter', 'Unknown dot shape', {
        offendingValue: toJsonValue(raw.dotShape),
        expected: DOT_SHAPES.join(', '),
        parameter: 'dotShape',
      }),
    );
  }

  return issues;
}

function isDotShape(value: unknown): value is DotShape {
  return typeof value === 'string' && (DOT_SHAPES as readonly string[]).includes(value);
}

/** Validates one channel's screening, TRC and limits, recording absent limits as identity. */
export function validateChannelContract(channel: InkChannel): Issue[] {
  const issues: Issue[] = [...validateScreeningConfiguration(channel.screening)];

  // The white role is the DTF white-ink mask: it must carry mask data. No other
  // role is constrained here, because the model allows mask channels generally.
  if (channel.role === WHITE_ROLE && channel.dataKind !== 'mask') {
    issues.push(
      createIssue('channel.white_requires_mask', 'The white role must be a mask channel', {
        offendingValue: { role: channel.role, dataKind: channel.dataKind },
        expected: 'dataKind "mask" for role "white"',
        channel: channel.id,
        parameter: 'dataKind',
      }),
    );
  }

  if (channel.trc !== undefined) {
    issues.push(...validateTrcControlPoints(channel.trc.points));
  }

  if (channel.limits !== undefined) {
    issues.push(...validateReproductionLimits(channel.limits));
  } else {
    issues.push(
      createIssue(
        'channel.limits_identity',
        'No reproduction limits configured; identity applied',
        {
          expected: 'declared a_wf and a_vf',
          channel: channel.id,
          parameter: 'limits',
        },
      ),
    );
  }

  return issues;
}

/** Validates every channel of a profile and warns on duplicate screen angles. */
export function validateProfileContract<TProcessAttributes>(
  profile: ProductionProfile<TProcessAttributes>,
): Issue[] {
  const issues: Issue[] = [];

  for (const channel of profile.channels) {
    issues.push(...validateChannelContract(channel));
  }

  const duplicateAngles = findDuplicateAngles(profile);
  if (duplicateAngles.length > 0) {
    issues.push(
      createIssue('profile.duplicate_channel_angles', 'Two or more channels share a screen angle', {
        offendingValue: duplicateAngles,
        expected: 'distinct screen angles per channel',
        parameter: 'channels[].screening.angle',
      }),
    );
  }

  return issues;
}

function findDuplicateAngles<TProcessAttributes>(
  profile: ProductionProfile<TProcessAttributes>,
): number[] {
  const seen = new Set<number>();
  const duplicates = new Set<number>();
  for (const channel of profile.channels) {
    const screening = channel.screening;
    if (screening.method !== 'am' || !isFiniteNumber(screening.angle)) continue;
    if (seen.has(screening.angle)) duplicates.add(screening.angle);
    seen.add(screening.angle);
  }
  return [...duplicates];
}
