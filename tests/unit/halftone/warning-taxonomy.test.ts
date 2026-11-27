import { describe, expect, it } from 'vitest';

import type {
  ContinuousToneInput,
  InkChannel,
  ProductionProfile,
  ScreeningRequest,
  TransformIdentity,
} from '../../../src/engines/halftone/contracts';
import {
  ISSUE_REGISTRY,
  ISSUE_SCOPES,
  createIssue,
  validateMeshDeclaration,
  validateScreeningRequest,
} from '../../../src/engines/halftone/contracts';
import { validateInputContract } from '../../../src/engines/halftone/input';

const identityTrc = {
  points: [
    { input: 0, output: 0 },
    { input: 1, output: 1 },
  ],
  interpolation: 'linear' as const,
};

function makeIdentity(): TransformIdentity {
  return {
    id: 'channel-preserving-transform',
    version: '1',
    type: 'channel-preserving',
    parameterHash: 'a'.repeat(64),
    hashAlgorithm: 'sha256',
    canonicalisationVersion: '1',
  };
}

function channel(overrides: Partial<InkChannel> = {}): InkChannel {
  return {
    id: 'k',
    role: 'black',
    dataKind: 'tone',
    screening: { method: 'am', frequency: 25, angle: 0, dotShape: 'round' },
    trc: identityTrc,
    limits: { a_wf: 0, a_vf: 1 },
    ...overrides,
  };
}

function profile(
  overrides: Partial<ProductionProfile<Record<string, unknown>>> = {},
): ProductionProfile<Record<string, unknown>> {
  return {
    id: 'taxonomy-profile',
    version: '1',
    processKind: 'screen-printing',
    channels: [channel()],
    separation: {
      mode: 'channel-preserving',
      identity: makeIdentity(),
      channelMap: { gray: 'k' },
    },
    ...overrides,
  };
}

function input(overrides: Partial<ContinuousToneInput> = {}): ContinuousToneInput {
  const data = new Uint8Array(16);
  for (let index = 0; index < data.length; index += 1) data[index] = index * 17;
  return { width: 4, height: 4, ppi: 100, bitDepth: 8, layout: 'grayscale', data, ...overrides };
}

function request(
  profileOverrides: Partial<ProductionProfile<Record<string, unknown>>> = {},
  overrides: { input?: ContinuousToneInput; dpi?: number } = {},
): ScreeningRequest<Record<string, unknown>> {
  return {
    input: overrides.input ?? input(),
    profile: profile(profileOverrides),
    output: { dpi: overrides.dpi ?? 100 },
  };
}

function codes(issues: readonly { readonly code: string }[]): string[] {
  return issues.map((issue) => issue.code);
}

// One entry per taxonomy code this feature owns or verifies; every code the
// emission tests below exercise appears here. The trace warning remains
// reserved vocabulary whose emission belongs to the trace API.
const TAXONOMY_TABLE = [
  ['input.low_resolution', 'warning', 'input'],
  ['input.prepared_artwork_override', 'warning', 'input'],
  ['profile.mesh_unvalidated', 'warning', 'profile'],
  ['profile.invalid_constraint', 'error', 'profile'],
  ['profile.unsupported_method', 'error', 'profile'],
  ['profile.missing_am_parameter', 'error', 'profile'],
  ['channel.limits_identity', 'warning', 'channel'],
  ['channel.trc_non_monotonic', 'info', 'channel'],
  ['geometry.duplicate_angle', 'warning', 'geometry'],
  ['geometry.insufficient_addressability', 'warning', 'geometry'],
  ['geometry.clipped_trace', 'warning', 'geometry'],
  ['output.unsupported_resolution', 'error', 'output'],
  ['output.preview_not_accepted', 'error', 'output'],
  ['preview.requested', 'info', 'preview'],
  ['preview.invalid_settings', 'error', 'preview'],
] as const;

describe('taxonomy registry', () => {
  it.each(TAXONOMY_TABLE)(
    '%s is %s/%s and derives its fields from the registry',
    (code, severity, scope) => {
      expect(ISSUE_REGISTRY[code]).toEqual({ severity, scope });
      const issue = createIssue(code, 'diagnostic');
      expect(issue.severity).toBe(severity);
      expect(issue.scope).toBe(scope);
    },
  );

  it('keeps every code stage-prefixed with a valid severity and scope', () => {
    for (const [code, definition] of Object.entries(ISSUE_REGISTRY)) {
      expect(code).toMatch(
        /^(input|profile|channel|separation|geometry|output|preview)\.[a-z][a-z0-9_]*$/,
      );
      expect(ISSUE_SCOPES).toContain(definition.scope);
      expect(code.slice(0, code.indexOf('.'))).toBe(definition.scope);
    }
  });

  it('represents every severity and every scope', () => {
    const definitions = Object.values(ISSUE_REGISTRY);
    expect(new Set(definitions.map((entry) => entry.severity))).toEqual(
      new Set(['error', 'warning', 'info']),
    );
    expect(new Set(definitions.map((entry) => entry.scope))).toEqual(new Set(ISSUE_SCOPES));
  });
});

describe('reproduction and sampling warnings', () => {
  it('warns once when two channels share a screen angle', () => {
    const issues = validateScreeningRequest(
      request({ channels: [channel({ id: 'c' }), channel({ id: 'm' })] }),
    );
    const duplicates = issues.filter((issue) => issue.code === 'geometry.duplicate_angle');
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]?.severity).toBe('warning');
    expect(duplicates[0]?.scope).toBe('geometry');
  });

  it('warns when output DPI/LPI is below the declared minimum cell pixels', () => {
    // 100 DPI / 25 LPI = 4 pixels per cell, below the declared 6.
    const issues = validateScreeningRequest(request({ minimumCellPixels: 6 }));
    const issue = issues.find((entry) => entry.code === 'geometry.insufficient_addressability');
    expect(issue?.severity).toBe('warning');
    expect(issue?.scope).toBe('geometry');
    expect(issue?.context.channel).toBe('k');
    expect(issue?.context.details).toMatchObject({
      dpi: 100,
      lpi: 25,
      cellPixels: 4,
      minimumCellPixels: 6,
    });
  });

  it('does not warn about addressability without a declared minimum', () => {
    expect(codes(validateScreeningRequest(request()))).not.toContain(
      'geometry.insufficient_addressability',
    );
  });

  it('does not warn about addressability when the ratio meets the minimum', () => {
    expect(codes(validateScreeningRequest(request({ minimumCellPixels: 4 })))).not.toContain(
      'geometry.insufficient_addressability',
    );
  });

  it('warns when the input ratio is below the declared minimum samples per screen line', () => {
    // 100 PPI / 25 LPI = 4 samples per line, below the declared 8.
    const issues = validateScreeningRequest(request({ minimumInputSamplesPerScreenLine: 8 }));
    const issue = issues.find((entry) => entry.code === 'input.low_resolution');
    expect(issue?.severity).toBe('warning');
    expect(issue?.scope).toBe('input');
    expect(issue?.context.details).toMatchObject({
      ppi: 100,
      lpi: 25,
      samplesPerScreenLine: 4,
      minimumInputSamplesPerScreenLine: 8,
    });
  });

  it('emits no low-resolution warning when the profile declares no threshold', () => {
    expect(codes(validateScreeningRequest(request()))).not.toContain('input.low_resolution');
  });

  it('keeps the input-sampling check independent of output addressability', () => {
    const inputOnly = validateScreeningRequest(request({ minimumInputSamplesPerScreenLine: 8 }));
    expect(codes(inputOnly)).toContain('input.low_resolution');
    expect(codes(inputOnly)).not.toContain('geometry.insufficient_addressability');

    const outputOnly = validateScreeningRequest(request({ minimumCellPixels: 6 }));
    expect(codes(outputOnly)).toContain('geometry.insufficient_addressability');
    expect(codes(outputOnly)).not.toContain('input.low_resolution');
  });
});

describe('profile constraints and mesh', () => {
  it.each([
    ['minimumCellPixels zero', { minimumCellPixels: 0 }],
    ['minimumCellPixels non-finite', { minimumCellPixels: Number.POSITIVE_INFINITY }],
    ['input samples negative', { minimumInputSamplesPerScreenLine: -1 }],
    ['allowed resolutions empty', { allowedOutputResolutions: [] }],
    ['allowed resolutions invalid', { allowedOutputResolutions: [0] }],
  ])('rejects an unusable declared constraint (%s)', (_label, overrides) => {
    const issues = validateScreeningRequest(request(overrides));
    const invalid = issues.filter((issue) => issue.code === 'profile.invalid_constraint');
    expect(invalid.length).toBeGreaterThan(0);
    expect(invalid.every((issue) => issue.severity === 'error')).toBe(true);
  });

  it('warns on a declared mesh without a validated mesh-to-LPI relation', () => {
    const issues = validateMeshDeclaration(profile({ processAttributes: { mesh: 230 } }));
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('profile.mesh_unvalidated');
    expect(issues[0]?.severity).toBe('warning');
    expect(issues[0]?.scope).toBe('profile');
    expect(issues[0]?.context.details).toEqual({ validatedRelation: false });
  });

  it('does not warn when no mesh is declared', () => {
    expect(validateMeshDeclaration(profile())).toEqual([]);
    expect(validateMeshDeclaration(profile({ processAttributes: { mesh: null } }))).toEqual([]);
    expect(
      validateMeshDeclaration(profile({ processAttributes: { note: 'caller-owned' } })),
    ).toEqual([]);
  });

  it('rejects an output DPI outside the declared allowed resolutions', () => {
    const issues = validateScreeningRequest(
      request({ allowedOutputResolutions: [100, 200] }, { dpi: 150 }),
    );
    const issue = issues.find((entry) => entry.code === 'output.unsupported_resolution');
    expect(issue?.severity).toBe('error');
    expect(issue?.scope).toBe('output');
  });

  it('accepts an output DPI inside the declared allowed resolutions', () => {
    expect(
      codes(validateScreeningRequest(request({ allowedOutputResolutions: [100, 200] }))),
    ).not.toContain('output.unsupported_resolution');
  });

  it('rejects a non-AM method and a missing AM parameter without substituting a default', () => {
    const nonAm = validateScreeningRequest({
      ...request(),
      profile: profile({
        channels: [channel({ screening: { method: 'fm' } as InkChannel['screening'] })],
      }),
    });
    expect(codes(nonAm)).toContain('profile.unsupported_method');

    const missing = validateScreeningRequest(
      request({
        channels: [
          channel({
            screening: { method: 'am', angle: 0, dotShape: 'round' } as InkChannel['screening'],
          }),
        ],
        minimumCellPixels: 6,
        minimumInputSamplesPerScreenLine: 8,
      }),
    );
    expect(codes(missing)).toContain('profile.missing_am_parameter');
    // No ratio is computed from a fabricated frequency.
    expect(codes(missing)).not.toContain('input.low_resolution');
    expect(codes(missing)).not.toContain('geometry.insufficient_addressability');
  });
});

describe('no silent pass', () => {
  const cases: readonly {
    readonly label: string;
    readonly profile: Partial<ProductionProfile<Record<string, unknown>>>;
    readonly expected: string;
  }[] = [
    {
      label: 'no reproduction limits',
      profile: { channels: [channel({ limits: undefined })] },
      expected: 'channel.limits_identity',
    },
    {
      label: 'non-monotonic TRC output',
      profile: {
        channels: [
          channel({
            trc: {
              points: [
                { input: 0, output: 0.2 },
                { input: 0.5, output: 0.9 },
                { input: 1, output: 0.4 },
              ],
              interpolation: 'linear',
            },
          }),
        ],
      },
      expected: 'channel.trc_non_monotonic',
    },
    {
      label: 'declared mesh',
      profile: { processAttributes: { mesh: 230 } },
      expected: 'profile.mesh_unvalidated',
    },
    {
      label: 'duplicate angles',
      profile: { channels: [channel({ id: 'c' }), channel({ id: 'm' })] },
      expected: 'geometry.duplicate_angle',
    },
    {
      label: 'insufficient addressability',
      profile: { minimumCellPixels: 6 },
      expected: 'geometry.insufficient_addressability',
    },
    {
      label: 'low input sampling',
      profile: { minimumInputSamplesPerScreenLine: 8 },
      expected: 'input.low_resolution',
    },
  ];

  it.each(cases)('$label produces a diagnostic', ({ profile: overrides, expected }) => {
    const issues = validateScreeningRequest(request(overrides));
    expect(codes(issues)).toContain(expected);
  });

  it('lets a fully declared, adequate profile produce no diagnostic', () => {
    const issues = validateScreeningRequest(
      request({ minimumCellPixels: 4, minimumInputSamplesPerScreenLine: 4 }),
    );
    expect(issues).toEqual([]);
  });

  it('carries the prepared-artwork override warning without rejecting the input', () => {
    const binary = input({
      data: Uint8Array.from([0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255]),
      preparedArtworkOverride: { acknowledged: true, reason: 'approved rescreening' },
    });
    const gate = validateInputContract(binary);
    expect(gate.status).toBe('accepted');
    expect(codes(gate.issues)).toContain('input.prepared_artwork_override');
  });
});
