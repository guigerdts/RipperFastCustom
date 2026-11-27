import { describe, expect, it } from 'vitest';

import type {
  ContinuousToneInput,
  InkChannel,
  ProductionProfile,
  ScreeningRequest,
  TransformIdentity,
} from '../../../src/engines/halftone/contracts';
import {
  createIssue,
  dedupeIssues,
  finalizeIssues,
  issueIdentity,
  sortIssues,
} from '../../../src/engines/halftone/contracts';
import { assembleScreeningResult } from '../../../src/engines/halftone/result';

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
    id: 'finalization-profile',
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

function run(
  profileOverrides: Partial<ProductionProfile<Record<string, unknown>>> = {},
  overrides: { input?: ContinuousToneInput; dpi?: number } = {},
) {
  return assembleScreeningResult({
    request: request(profileOverrides, overrides),
  });
}

function codes(issues: readonly { readonly code: string }[]): string[] {
  return issues.map((issue) => issue.code);
}

describe('deterministic ordering and deduplication', () => {
  it('collapses an identical condition reported by more than one stage', () => {
    const first = createIssue('channel.limits_identity', 'identity', { channel: 'k' });
    const second = createIssue('channel.limits_identity', 'identity', { channel: 'k' });
    expect(dedupeIssues([first, second])).toHaveLength(1);
  });

  it('keeps distinct conditions that differ only in structured context', () => {
    const cyan = createIssue('input.low_resolution', 'low', { channel: 'c' });
    const magenta = createIssue('input.low_resolution', 'low', { channel: 'm' });
    expect(dedupeIssues([cyan, magenta])).toHaveLength(2);
  });

  it('orders issues by pipeline stage, then code', () => {
    const shuffled = [
      createIssue('preview.requested', 'preview'),
      createIssue('geometry.duplicate_angle', 'duplicate'),
      createIssue('input.low_resolution', 'low', { channel: 'k' }),
      createIssue('channel.limits_identity', 'identity', { channel: 'k' }),
    ];
    expect(sortIssues(shuffled).map((issue) => issue.scope)).toEqual([
      'input',
      'channel',
      'geometry',
      'preview',
    ]);
  });

  it('produces the same order and deduplication whatever the input order', () => {
    const issues = [
      createIssue('input.low_resolution', 'low', { channel: 'k' }),
      createIssue('channel.limits_identity', 'identity', { channel: 'k' }),
      createIssue('input.low_resolution', 'low', { channel: 'k' }),
      createIssue('geometry.insufficient_addressability', 'addressable', { channel: 'k' }),
    ];
    expect(finalizeIssues(issues)).toEqual(finalizeIssues([...issues].reverse()));
    expect(finalizeIssues(issues)).toHaveLength(3);
  });
});

describe('integration through the result envelope', () => {
  it('reports one identity-limits warning for a channel without limits', () => {
    const result = run({ channels: [channel({ limits: undefined })] });
    expect(result.status).toBe('completed');
    expect(result.issues.filter((issue) => issue.code === 'channel.limits_identity')).toHaveLength(
      1,
    );
  });

  it('carries the sampling warnings in a completed result and records them in the snapshot', () => {
    const result = run({
      minimumCellPixels: 6,
      minimumInputSamplesPerScreenLine: 8,
    });
    expect(result.status).toBe('completed');
    if (result.status !== 'completed') return;

    expect(codes(result.issues)).toContain('geometry.insufficient_addressability');
    expect(codes(result.issues)).toContain('input.low_resolution');
    expect(result.snapshot.input.samplesPerScreenLine).toBe(4);
    expect(result.snapshot.input.minimumCellPixels).toBe(6);
    expect(result.snapshot.input.minimumInputSamplesPerScreenLine).toBe(8);
  });

  it('preserves every diagnostic in a rejected result, deduplicated and ordered', () => {
    const result = run({
      channels: [
        channel({ limits: { a_wf: 0.9, a_vf: 0.1 } }),
        channel({ id: 'm', role: 'magenta' }),
      ],
      minimumCellPixels: 6,
    });
    expect(result.status).toBe('rejected');
    expect('rasters' in result).toBe(false);
    expect('snapshot' in result).toBe(false);

    const resultCodes = codes(result.issues);
    expect(resultCodes).toContain('channel.limits_invalid');
    expect(resultCodes).toContain('geometry.duplicate_angle');
    expect(resultCodes).toContain('geometry.insufficient_addressability');
    const identities = result.issues.map((issue) => issueIdentity(issue));
    expect(new Set(identities).size).toBe(identities.length);
    expect(result.issues).toEqual(finalizeIssues(result.issues));
  });
});
