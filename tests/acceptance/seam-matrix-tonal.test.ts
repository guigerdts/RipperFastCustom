// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  codes,
  flatInput,
  grayProfile,
  IDENTITY_LIMITS,
  rampInput,
  rasterDigest,
  run,
  toneChannel,
} from './fixtures';

/**
 * Acceptance matrix, part 2a: the tonal chain (spec criteria 6-8). Every case
 * drives the single public seam. The stage trace itself is internal, so
 * criterion 6 asserts the same four stages through their seam-visible summaries
 * (`commanded`, `corrected`, `reproducible`, `screened`), while the structural
 * trace proof lives in `tests/unit/halftone/tonal-chain.test.ts`.
 */

function channel(overrides: Parameters<typeof toneChannel>[0] = {}) {
  return { ...toneChannel(), ...overrides };
}

describe('spec AC6: the four tonal stages are observable', () => {
  it('records commanded, corrected, reproducible and screened as separate stages', () => {
    const result = run({ input: flatInput(128), profile: grayProfile() });
    expect(result.status).toBe('completed');
    if (result.status !== 'completed') return;

    const summaries = result.channels[0]?.summaries;
    expect(summaries).toBeDefined();
    for (const stage of ['commanded', 'corrected', 'reproducible', 'screened'] as const) {
      expect(summaries?.[stage], stage).toMatchObject({
        min: expect.any(Number),
        max: expect.any(Number),
        mean: expect.any(Number),
        atZero: expect.any(Number),
        atOne: expect.any(Number),
      });
    }
    expect(summaries?.commanded.mean).toBeCloseTo(128 / 255, 12);
  });

  it('records identity TRC and identity limits as applied stages, never skipped', () => {
    const result = run({ input: flatInput(128), profile: grayProfile() });
    expect(result.status).toBe('completed');
    if (result.status !== 'completed') return;

    const meta = result.channels[0];
    expect(meta?.trcApplied).toBe(true);
    expect(meta?.limitsApplied).toBe(true);
    expect(meta?.trc.points).toEqual([
      { input: 0, output: 0 },
      { input: 1, output: 1 },
    ]);
    expect(meta?.limits).toEqual(IDENTITY_LIMITS);

    const snapshotChannel = result.snapshot.channels[0];
    expect(snapshotChannel?.trcApplied).toBe(true);
    expect(snapshotChannel?.limitsApplied).toBe(true);
    expect(snapshotChannel?.trc.points).toHaveLength(2);
    expect(snapshotChannel?.limits).toEqual(IDENTITY_LIMITS);
  });
});

describe('spec AC7: TRC application and validation', () => {
  const trc = {
    points: [
      { input: 0, output: 0 },
      { input: 0.5, output: 0.8 },
      { input: 1, output: 1 },
    ],
    interpolation: 'linear' as const,
  };

  it('applies a TRC deterministically and preserves its control points', () => {
    const profile = grayProfile({ channels: [channel({ trc })] });
    const first = run({ input: rampInput(), profile });
    const second = run({ input: rampInput(), profile });
    expect(first.status).toBe('completed');
    expect(second.status).toBe('completed');
    if (first.status !== 'completed' || second.status !== 'completed') return;

    expect(rasterDigest(second)).toBe(rasterDigest(first));
    expect(second.snapshot.hash).toBe(first.snapshot.hash);
    expect(first.snapshot.channels[0]?.trc).toEqual(trc);
    expect(first.channels[0]?.summaries.corrected.mean).toBeGreaterThan(
      first.channels[0]?.summaries.commanded.mean ?? 0,
    );
  });

  it('rejects ambiguous control points', () => {
    const result = run({
      input: rampInput(),
      profile: grayProfile({
        channels: [
          channel({
            trc: {
              points: [
                { input: 0, output: 0 },
                { input: 0.5, output: 0.4 },
                { input: 0.5, output: 0.8 },
                { input: 1, output: 1 },
              ],
              interpolation: 'linear',
            },
          }),
        ],
      }),
    });
    expect(result.status).toBe('rejected');
    expect(codes(result)).toEqual(['channel.trc_ambiguous']);
  });

  it('reports non-monotonic output as a diagnostic, not a rejection', () => {
    const result = run({
      input: rampInput(),
      profile: grayProfile({
        channels: [
          channel({
            trc: {
              points: [
                { input: 0, output: 0 },
                { input: 0.5, output: 0.8 },
                { input: 0.75, output: 0.6 },
                { input: 1, output: 1 },
              ],
              interpolation: 'linear',
            },
          }),
        ],
      }),
    });
    expect(result.status).toBe('completed');
    expect(codes(result)).toEqual(['channel.trc_non_monotonic']);
    expect(result.issues[0]?.severity).toBe('info');
  });
});

describe('spec AC8: reproduction limits after the TRC', () => {
  const limited = channel({ limits: { a_wf: 0.3, a_vf: 0.7 } });

  it('clamps below a_wf, above a_vf and interpolates the interval', () => {
    const below = run({ input: flatInput(76), profile: grayProfile({ channels: [limited] }) });
    const inside = run({ input: flatInput(128), profile: grayProfile({ channels: [limited] }) });
    const above = run({ input: flatInput(179), profile: grayProfile({ channels: [limited] }) });

    expect(below.status).toBe('completed');
    expect(inside.status).toBe('completed');
    expect(above.status).toBe('completed');
    if (
      below.status !== 'completed' ||
      inside.status !== 'completed' ||
      above.status !== 'completed'
    ) {
      return;
    }
    expect(below.channels[0]?.summaries.reproducible.mean).toBe(0);
    expect(inside.channels[0]?.summaries.reproducible.mean).toBeCloseTo(0.5, 1);
    expect(above.channels[0]?.summaries.reproducible.mean).toBe(1);
  });

  it('preserves a_commanded and a_corrected as independent stages', () => {
    const result = run({ input: flatInput(76), profile: grayProfile({ channels: [limited] }) });
    expect(result.status).toBe('completed');
    if (result.status !== 'completed') return;

    const summaries = result.channels[0]?.summaries;
    expect(summaries?.commanded.mean).toBeCloseTo(76 / 255, 12);
    expect(summaries?.corrected.mean).toBeCloseTo(76 / 255, 12);
    expect(summaries?.reproducible.mean).toBe(0);
    expect(summaries?.reproducible.mean).not.toBe(summaries?.corrected.mean);
    expect(result.snapshot.channels[0]?.limits).toEqual({ a_wf: 0.3, a_vf: 0.7 });
  });

  it('rejects invalid ranges', () => {
    const ranges = [
      { a_wf: 0.8, a_vf: 0.2 },
      { a_wf: 0.5, a_vf: 0.5 },
      { a_wf: -0.1, a_vf: 1 },
      { a_wf: 0, a_vf: 1.5 },
    ];
    for (const limits of ranges) {
      const result = run({
        input: flatInput(128),
        profile: grayProfile({ channels: [channel({ limits })] }),
      });
      expect(result.status, JSON.stringify(limits)).toBe('rejected');
      expect(codes(result), JSON.stringify(limits)).toEqual(['channel.limits_invalid']);
    }
  });

  it('treats absent limits as identity with an informational record', () => {
    const result = run({
      input: flatInput(128),
      profile: grayProfile({
        channels: [{ ...toneChannel(), limits: undefined }],
      }),
    });
    expect(result.status).toBe('completed');
    expect(codes(result)).toEqual(['channel.limits_identity']);
    if (result.status !== 'completed') return;
    expect(result.channels[0]?.limitsApplied).toBe(false);
    expect(result.channels[0]?.limits).toEqual(IDENTITY_LIMITS);
    expect(result.issues[0]?.severity).toBe('warning');
  });
});
