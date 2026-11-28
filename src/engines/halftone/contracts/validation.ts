import { createIssue, toJsonValue } from './issue';
import type { Issue } from './issue';
import { DOT_SHAPES } from './screening';
import type { DotShape, ScreeningConfiguration } from './screening';
import { WHITE_ROLE } from './profile';
import type { InkChannel, ProductionProfile } from './profile';
import type { ContinuousToneInput, ScreeningRequest } from './request';
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
      createIssue('geometry.duplicate_angle', 'Two or more channels share a screen angle', {
        offendingValue: duplicateAngles,
        expected: 'distinct screen angles per channel',
        parameter: 'channels[].screening.angle',
      }),
    );
  }

  issues.push(...validateProfileConstraints(profile));

  return issues;
}

function isPositiveThreshold(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

/**
 * Validates the numeric constraints a profile declares. A constraint the engine
 * cannot evaluate must not pass silently: an unusable threshold is rejected
 * rather than ignored.
 */
export function validateProfileConstraints<TProcessAttributes>(
  profile: ProductionProfile<TProcessAttributes>,
): Issue[] {
  const issues: Issue[] = [];

  if (profile.minimumCellPixels !== undefined && !isPositiveThreshold(profile.minimumCellPixels)) {
    issues.push(
      createIssue(
        'profile.invalid_constraint',
        'minimumCellPixels must be a finite positive number of output pixels per cell.',
        {
          offendingValue: toJsonValue(profile.minimumCellPixels),
          expected: 'finite pixels per cell > 0',
          profileField: 'minimumCellPixels',
          parameter: 'minimumCellPixels',
        },
      ),
    );
  }

  if (
    profile.minimumInputSamplesPerScreenLine !== undefined &&
    !isPositiveThreshold(profile.minimumInputSamplesPerScreenLine)
  ) {
    issues.push(
      createIssue(
        'profile.invalid_constraint',
        'minimumInputSamplesPerScreenLine must be a finite positive ratio.',
        {
          offendingValue: toJsonValue(profile.minimumInputSamplesPerScreenLine),
          expected: 'finite input samples per screen line > 0',
          profileField: 'minimumInputSamplesPerScreenLine',
          parameter: 'minimumInputSamplesPerScreenLine',
        },
      ),
    );
  }

  if (profile.allowedOutputResolutions !== undefined) {
    const allowed: unknown = profile.allowedOutputResolutions;
    const usable =
      Array.isArray(allowed) &&
      allowed.length > 0 &&
      allowed.every((value: unknown) => isPositiveThreshold(value));
    if (!usable) {
      issues.push(
        createIssue(
          'profile.invalid_constraint',
          'allowedOutputResolutions must be a non-empty list of finite positive DPI values.',
          {
            offendingValue: toJsonValue(allowed),
            expected: 'non-empty list of finite DPI values > 0',
            profileField: 'allowedOutputResolutions',
            parameter: 'allowedOutputResolutions',
          },
        ),
      );
    }
  }

  return issues;
}

/**
 * A declared mesh without a validated mesh-to-LPI relation is unverified. v1
 * provides no mesh physical simulation and no mesh-to-LPI formula, so it cannot
 * validate the relation: every declared mesh is reported as unvalidated instead
 * of being trusted silently.
 */
export function validateMeshDeclaration<TProcessAttributes>(
  profile: ProductionProfile<TProcessAttributes>,
): Issue[] {
  const attributes: unknown = profile.processAttributes;
  if (attributes === null || typeof attributes !== 'object' || Array.isArray(attributes)) return [];

  const record = attributes as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(record, 'mesh')) return [];
  const mesh = record.mesh;
  if (mesh === undefined || mesh === null) return [];

  return [
    createIssue(
      'profile.mesh_unvalidated',
      'The profile declares a mesh but no validated mesh-to-LPI relation exists; the mesh is not applied.',
      {
        offendingValue: toJsonValue(mesh),
        expected: 'a validated mesh-to-LPI relation',
        profileField: 'processAttributes.mesh',
        parameter: 'mesh',
        details: { validatedRelation: false },
      },
    ),
  ];
}

/**
 * The request's own output DPI must be a finite positive number before any
 * downstream stage reads it. This is a contract rejection, distinct from the
 * profile policy check below: `output.unsupported_resolution` means a usable
 * value the profile does not allow, never an unusable value.
 */
export function validateOutputDpiValue(outputDpi: number): Issue[] {
  if (isPositiveThreshold(outputDpi)) return [];

  return [
    createIssue(
      'output.invalid_resolution',
      'The requested output DPI must be a finite positive number.',
      {
        offendingValue: toJsonValue(outputDpi),
        expected: 'finite output DPI > 0',
        parameter: 'output.dpi',
      },
    ),
  ];
}

/**
 * The output DPI must satisfy the profile's declared allowed resolutions when
 * it declares any. An unenforced declaration would silently accept output the
 * profile rejects.
 */
export function validateOutputResolution<TProcessAttributes>(
  profile: ProductionProfile<TProcessAttributes>,
  outputDpi: number,
): Issue[] {
  const allowed: unknown = profile.allowedOutputResolutions;
  if (!Array.isArray(allowed) || allowed.length === 0) return [];
  if (allowed.some((value: unknown) => value === outputDpi)) return [];

  return [
    createIssue(
      'output.unsupported_resolution',
      'The requested output DPI is not in the profile-declared allowed resolutions.',
      {
        offendingValue: outputDpi,
        expected: `one of ${allowed.join(', ')} DPI`,
        parameter: 'output.dpi',
        profileField: 'allowedOutputResolutions',
      },
    ),
  ];
}

function amFrequency(channel: InkChannel): number | undefined {
  const screening = channel.screening;
  if (screening === null || typeof screening !== 'object') return undefined;
  if (screening.method !== 'am') return undefined;
  const frequency: unknown = (screening as { frequency?: unknown }).frequency;
  return isPositiveThreshold(frequency) ? frequency : undefined;
}

/**
 * Cross-stage sampling checks. The output addressability check concerns the
 * output raster's geometric representation (`output DPI / LPI` against the
 * declared minimum cell pixels); the input check concerns the input's sampling
 * density (`input PPI / LPI` against the declared minimum input samples per
 * screen line). They are independent and never substitute for each other.
 */
export function validateSamplingRatios<TProcessAttributes>(
  profile: ProductionProfile<TProcessAttributes>,
  input: ContinuousToneInput,
  outputDpi: number,
): Issue[] {
  const issues: Issue[] = [];
  const minimumCellPixels = isPositiveThreshold(profile.minimumCellPixels)
    ? profile.minimumCellPixels
    : undefined;
  const minimumSamples = isPositiveThreshold(profile.minimumInputSamplesPerScreenLine)
    ? profile.minimumInputSamplesPerScreenLine
    : undefined;

  if (minimumCellPixels === undefined && minimumSamples === undefined) return issues;

  const ppi: unknown = input.ppi;
  const usablePpi = isPositiveThreshold(ppi) ? ppi : undefined;

  for (const channel of profile.channels) {
    const lpi = amFrequency(channel);
    if (lpi === undefined) continue;

    if (minimumCellPixels !== undefined) {
      const cellPixels = outputDpi / lpi;
      if (Number.isFinite(cellPixels) && cellPixels < minimumCellPixels) {
        issues.push(
          createIssue(
            'geometry.insufficient_addressability',
            'The output raster has fewer pixels per cell than the profile-declared minimum.',
            {
              offendingValue: cellPixels,
              expected: `at least ${minimumCellPixels} output pixels per cell`,
              channel: channel.id,
              parameter: 'output.dpi / screening.frequency',
              details: {
                dpi: outputDpi,
                lpi,
                cellPixels,
                minimumCellPixels,
              },
            },
          ),
        );
      }
    }

    if (minimumSamples !== undefined && usablePpi !== undefined) {
      const samplesPerScreenLine = usablePpi / lpi;
      if (Number.isFinite(samplesPerScreenLine) && samplesPerScreenLine < minimumSamples) {
        issues.push(
          createIssue(
            'input.low_resolution',
            'The input provides fewer samples per screen line than the profile-declared minimum.',
            {
              offendingValue: samplesPerScreenLine,
              expected: `at least ${minimumSamples} input samples per screen line`,
              channel: channel.id,
              parameter: 'input.ppi / screening.frequency',
              details: {
                ppi: usablePpi,
                lpi,
                samplesPerScreenLine,
                minimumInputSamplesPerScreenLine: minimumSamples,
              },
            },
          ),
        );
      }
    }
  }

  return issues;
}

/**
 * Integrated validation for a screening request: the profile contract, its
 * declared constraints, the mesh declaration, the allowed output resolution and
 * the two independent sampling checks. Errors reject the run; warnings and
 * informational issues allow it.
 */
export function validateScreeningRequest<TProcessAttributes>(
  request: ScreeningRequest<TProcessAttributes>,
): Issue[] {
  const profile = request.profile;
  // An unusable output DPI is reported once, at request level. The policy and
  // ratio checks below are skipped for it so the caller never receives an
  // `unsupported_resolution` or sampling issue derived from a value that was
  // never usable. The pipeline stops on this rejection before geometry runs.
  const dpiIssues = validateOutputDpiValue(request.output.dpi);
  const dpiUsable = dpiIssues.length === 0;

  return [
    ...dpiIssues,
    ...validateProfileContract(profile),
    ...validateMeshDeclaration(profile),
    ...(dpiUsable ? validateOutputResolution(profile, request.output.dpi) : []),
    ...(dpiUsable ? validateSamplingRatios(profile, request.input, request.output.dpi) : []),
  ];
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
