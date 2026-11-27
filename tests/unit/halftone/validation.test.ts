import { describe, expect, it } from 'vitest';
import {
  resolveOutcomeStatus,
  validateProfileContract,
  validateReproductionLimits,
  validateScreeningConfiguration,
  validateTrcControlPoints,
  type InkChannel,
  type ProductionProfile,
  type ScreeningConfiguration,
  type ScreeningRequest,
  type ToneReproductionCurve,
} from '../../../src/engines/halftone/contracts';

const identityTrc: ToneReproductionCurve = {
  points: [
    { input: 0, output: 0 },
    { input: 1, output: 1 },
  ],
  interpolation: 'linear',
};

function channel(overrides: Partial<InkChannel> = {}): InkChannel {
  return {
    id: 'cyan',
    role: 'cyan',
    dataKind: 'tone',
    screening: { method: 'am', frequency: 100, angle: 45, dotShape: 'round' },
    trc: identityTrc,
    limits: { a_wf: 0.05, a_vf: 0.95 },
    ...overrides,
  };
}

function profileOf(...channels: InkChannel[]): ProductionProfile {
  return {
    id: 'fixture-profile',
    version: '1.0.0',
    processKind: 'screen-printing',
    channels,
  };
}

describe('TRC control-point validation', () => {
  it('accepts an identity curve', () => {
    expect(validateTrcControlPoints(identityTrc.points)).toEqual([]);
  });

  it('accepts an empty curve as identity', () => {
    expect(validateTrcControlPoints([])).toEqual([]);
  });

  it('rejects a control point outside [0, 1]', () => {
    const issues = validateTrcControlPoints([
      { input: 0, output: 0 },
      { input: 1.5, output: 1 },
    ]);
    expect(issues.map((issue) => issue.code)).toContain('channel.trc_out_of_range');
    expect(issues.every((issue) => issue.severity === 'error')).toBe(true);
  });

  it('rejects duplicate control-point inputs as ambiguous', () => {
    const issues = validateTrcControlPoints([
      { input: 0.5, output: 0.2 },
      { input: 0.5, output: 0.8 },
    ]);
    expect(issues.map((issue) => issue.code)).toContain('channel.trc_ambiguous');
  });

  it('rejects non-increasing control-point inputs as ambiguous', () => {
    const issues = validateTrcControlPoints([
      { input: 0.6, output: 0.2 },
      { input: 0.4, output: 0.8 },
    ]);
    expect(issues.map((issue) => issue.code)).toContain('channel.trc_ambiguous');
  });

  it('reports a non-monotonic output as informational, never as a rejection', () => {
    const issues = validateTrcControlPoints([
      { input: 0, output: 0.2 },
      { input: 0.5, output: 0.9 },
      { input: 1, output: 0.4 },
    ]);
    const info = issues.find((issue) => issue.code === 'channel.trc_non_monotonic');
    expect(info?.severity).toBe('info');
    expect(resolveOutcomeStatus(issues)).toBe('completed');
  });

  it('still detects a duplicate input that follows a point with an invalid output', () => {
    const issues = validateTrcControlPoints([
      { input: 0.5, output: Number.NaN },
      { input: 0.5, output: 0.8 },
    ]);
    const codes = issues.map((issue) => issue.code);
    expect(codes).toContain('channel.trc_out_of_range');
    expect(codes).toContain('channel.trc_ambiguous');
  });

  it('still detects a disordered input that follows a point with an infinite output', () => {
    const issues = validateTrcControlPoints([
      { input: 0.6, output: Number.POSITIVE_INFINITY },
      { input: 0.4, output: 0.8 },
    ]);
    const codes = issues.map((issue) => issue.code);
    expect(codes).toContain('channel.trc_out_of_range');
    expect(codes).toContain('channel.trc_ambiguous');
  });

  it('reports an invalid input and an invalid output as independent diagnostics', () => {
    const issues = validateTrcControlPoints([{ input: Number.NaN, output: 5 }]);
    const outOfRange = issues.filter((issue) => issue.code === 'channel.trc_out_of_range');
    expect(outOfRange).toHaveLength(2);
    expect(outOfRange.map((issue) => issue.context.parameter)).toEqual([
      'trc.points[].input',
      'trc.points[].output',
    ]);
  });
});

describe('reproduction-limit validation', () => {
  it('accepts finite limits with a_wf < a_vf', () => {
    expect(validateReproductionLimits({ a_wf: 0.05, a_vf: 0.95 })).toEqual([]);
  });

  it('rejects limits outside [0, 1]', () => {
    const issues = validateReproductionLimits({ a_wf: -0.1, a_vf: 0.9 });
    expect(issues.map((issue) => issue.code)).toContain('channel.limits_invalid');
  });

  it('rejects non-finite limits', () => {
    const issues = validateReproductionLimits({ a_wf: Number.NaN, a_vf: 0.9 });
    expect(issues.map((issue) => issue.code)).toContain('channel.limits_invalid');
  });

  it('rejects inverted limits where a_wf >= a_vf', () => {
    expect(validateReproductionLimits({ a_wf: 0.6, a_vf: 0.4 })).not.toEqual([]);
    expect(validateReproductionLimits({ a_wf: 0.5, a_vf: 0.5 })).not.toEqual([]);
  });

  it('serialises a non-finite offending limit as diagnostic text, not as a raw number', () => {
    const [issue] = validateReproductionLimits({ a_wf: Number.NaN, a_vf: 0.9 });
    expect(issue).toBeDefined();
    if (issue === undefined) return;
    const roundTrip = JSON.parse(JSON.stringify(issue)) as typeof issue;
    expect(roundTrip.context.offendingValue).toEqual({ a_wf: 'NaN', a_vf: 0.9 });
  });
});

describe('AM screening validation', () => {
  it('accepts a complete AM configuration', () => {
    expect(
      validateScreeningConfiguration({
        method: 'am',
        frequency: 100,
        angle: 45,
        dotShape: 'round',
      }),
    ).toEqual([]);
  });

  it('accepts an angle of zero degrees', () => {
    expect(
      validateScreeningConfiguration({
        method: 'am',
        frequency: 100,
        angle: 0,
        dotShape: 'square',
      }),
    ).toEqual([]);
  });

  it('reports a missing AM parameter as an issue, never as a default', () => {
    const issues = validateScreeningConfiguration({
      method: 'am',
      angle: 45,
      dotShape: 'round',
    } as unknown as ScreeningConfiguration);
    expect(issues.map((issue) => issue.code)).toContain('profile.missing_am_parameter');
  });

  it('rejects a non-positive frequency', () => {
    const issues = validateScreeningConfiguration({
      method: 'am',
      frequency: 0,
      angle: 45,
      dotShape: 'round',
    });
    expect(issues.map((issue) => issue.code)).toContain('profile.invalid_am_parameter');
  });

  it('rejects an unknown dot shape', () => {
    const issues = validateScreeningConfiguration({
      method: 'am',
      frequency: 100,
      angle: 45,
      dotShape: 'hexagon',
    } as unknown as ScreeningConfiguration);
    expect(issues.map((issue) => issue.code)).toContain('profile.invalid_am_parameter');
  });

  it('rejects a non-AM method as unsupported', () => {
    const issues = validateScreeningConfiguration({ method: 'fm' });
    expect(issues.map((issue) => issue.code)).toContain('profile.unsupported_method');
  });
});

describe('profile contract validation', () => {
  it('accepts a minimal valid profile', () => {
    expect(validateProfileContract(profileOf(channel()))).toEqual([]);
  });

  it('accepts an extensible custom process kind', () => {
    const profile = { ...profileOf(channel()), processKind: 'custom-process' };
    expect(validateProfileContract(profile)).toEqual([]);
  });

  it('treats white as a role, not a special case', () => {
    const white = channel({ id: 'white', role: 'white', dataKind: 'mask' });
    expect(validateProfileContract(profileOf(white))).toEqual([]);
  });

  it('records a channel without limits as an identity warning', () => {
    const issues = validateProfileContract(profileOf(channel({ limits: undefined })));
    const identity = issues.find((issue) => issue.code === 'channel.limits_identity');
    expect(identity?.severity).toBe('warning');
    expect(resolveOutcomeStatus(issues)).toBe('completed');
  });

  it('warns when two channels share a screen angle', () => {
    const profile = profileOf(
      channel({
        id: 'c',
        role: 'cyan',
        screening: { method: 'am', frequency: 100, angle: 45, dotShape: 'round' },
      }),
      channel({
        id: 'm',
        role: 'magenta',
        screening: { method: 'am', frequency: 100, angle: 45, dotShape: 'round' },
      }),
    );
    const issues = validateProfileContract(profile);
    const duplicate = issues.find((issue) => issue.code === 'geometry.duplicate_angle');
    expect(duplicate?.severity).toBe('warning');
    expect(duplicate?.scope).toBe('geometry');
  });

  it('rejects the run when any channel has a contract error', () => {
    const invalid = channel({ limits: { a_wf: 0.9, a_vf: 0.1 } });
    const issues = validateProfileContract(profileOf(invalid));
    expect(resolveOutcomeStatus(issues)).toBe('rejected');
  });

  it('rejects a white channel that is not a mask', () => {
    const issues = validateProfileContract(
      profileOf(channel({ id: 'white', role: 'white', dataKind: 'tone' })),
    );
    const white = issues.find((issue) => issue.code === 'channel.white_requires_mask');
    expect(white?.severity).toBe('error');
    expect(resolveOutcomeStatus(issues)).toBe('rejected');
  });

  it('accepts a white channel that is a mask', () => {
    const issues = validateProfileContract(
      profileOf(channel({ id: 'white', role: 'white', dataKind: 'mask' })),
    );
    expect(issues.map((issue) => issue.code)).not.toContain('channel.white_requires_mask');
  });

  it('does not impose the white mask rule on other roles', () => {
    const issues = validateProfileContract(
      profileOf(channel({ id: 'spot', role: 'spot-orange', dataKind: 'mask' })),
    );
    expect(issues.map((issue) => issue.code)).not.toContain('channel.white_requires_mask');
  });

  it('carries typed process attributes without an untyped property bag', () => {
    interface CustomAttributes {
      readonly note: string;
    }
    const profile: ProductionProfile<CustomAttributes> = {
      id: 'custom-profile',
      version: '1.0.0',
      processKind: 'custom-process',
      channels: [channel()],
      processAttributes: { note: 'caller-owned' },
    };
    expect(validateProfileContract(profile)).toEqual([]);
    expect(JSON.parse(JSON.stringify(profile.processAttributes))).toEqual({ note: 'caller-owned' });
  });
});

describe('request envelope', () => {
  it('represents a minimal valid request with profile, channel, TRC, limits and issues', () => {
    const request: ScreeningRequest = {
      input: {
        width: 4,
        height: 4,
        ppi: 300,
        bitDepth: 8,
        layout: 'grayscale',
        data: new Uint8Array(16),
      },
      profile: profileOf(channel()),
      output: { dpi: 600 },
    };
    expect(validateProfileContract(request.profile)).toEqual([]);
    expect(request.output.dpi).toBe(600);
  });
});
