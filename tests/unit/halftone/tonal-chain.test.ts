import { describe, expect, it } from 'vitest';
import {
  isRegisteredIssueCode,
  type ReproductionLimits,
  type TonalChannelInput,
  type TonalChainResult,
  type TonalChannelResult,
  type ToneReproductionCurve,
} from '../../../src/engines/halftone/contracts';
import { applyTonalChain, traceTonalChain } from '../../../src/engines/halftone/tonal';

const FX = (value: number): number => Math.floor(value * 65535 + 0.5);

function makeChannel(overrides: Partial<TonalChannelInput> = {}): TonalChannelInput {
  return { id: 'k', commanded: Uint16Array.from([0, 65535]), ...overrides };
}

function codes(result: TonalChainResult): string[] {
  return result.issues.map((issue) => issue.code);
}

function accepted(result: TonalChainResult): readonly TonalChannelResult[] {
  if (result.status !== 'accepted') throw new Error('expected an accepted tonal chain');
  return result.channels;
}

function channelOf(result: TonalChainResult, index = 0): TonalChannelResult {
  const channel = accepted(result)[index];
  if (channel === undefined) throw new Error(`missing channel ${index}`);
  return channel;
}

describe('identity stages and the four-stage trace', () => {
  it('records identity TRC and identity limits as stages, not skipped', () => {
    const result = applyTonalChain({
      channels: [makeChannel({ commanded: Uint16Array.from([0, 16384, 32768, 65535]) })],
    });

    expect(result.status).toBe('accepted');
    const k = channelOf(result);
    expect(k.trcApplied).toBe(false);
    expect(k.limitsApplied).toBe(false);
    expect(k.trc.points).toEqual([
      { input: 0, output: 0 },
      { input: 1, output: 1 },
    ]);
    expect(k.limits).toEqual({ a_wf: 0, a_vf: 1 });
    // Identity round-trips exactly for every 16-bit sample.
    expect(Array.from(k.corrected)).toEqual([0, 16384, 32768, 65535]);
    expect(Array.from(k.reproducible)).toEqual([0, 16384, 32768, 65535]);
  });

  it('exposes all four stages through the trace for an identity configuration', () => {
    const result = applyTonalChain({
      channels: [makeChannel({ commanded: Uint16Array.from([0, 16384, 32768, 65535]) })],
    });
    const k = channelOf(result);

    const trace = traceTonalChain(
      k,
      { samples: [0, 1, 2, 3] },
      { screeningResultAt: (index) => index / 10 },
    );

    expect(trace.channelId).toBe('k');
    expect(trace.entries).toHaveLength(4);
    for (const entry of trace.entries) {
      expect(entry.commanded).toBeCloseTo(entry.corrected, 10);
      expect(entry.corrected).toBeCloseTo(entry.reproducible, 10);
      expect(typeof entry.screeningResult).toBe('number');
    }
    expect(trace.entries[0]?.commanded).toBe(0);
    expect(trace.entries[3]?.commanded).toBe(1);
    expect(trace.entries[2]?.screeningResult).toBeCloseTo(0.2, 10);
  });

  it('keeps the screening slot present as null before screening', () => {
    const result = applyTonalChain({
      channels: [makeChannel({ commanded: Uint16Array.from([0, 65535]) })],
    });
    const trace = traceTonalChain(channelOf(result), { samples: [0, 1] });

    expect(trace.entries).toHaveLength(2);
    for (const entry of trace.entries) {
      expect(entry).toHaveProperty('screeningResult');
      expect(entry.screeningResult).toBeNull();
    }
  });

  it('expands a rectangular region against the row stride', () => {
    const result = applyTonalChain({
      channels: [makeChannel({ commanded: Uint16Array.from({ length: 12 }, (_, i) => i * 1000) })],
    });
    const trace = traceTonalChain(channelOf(result), {
      region: { x: 1, y: 1, width: 2, height: 1 },
      stride: 4,
    });

    expect(trace.entries.map((entry) => entry.index)).toEqual([5, 6]);
  });
});

describe('TRC evaluation', () => {
  it('applies a linear TRC deterministically and preserves its control points', () => {
    const trc: ToneReproductionCurve = {
      points: [
        { input: 0, output: 0 },
        { input: 1, output: 0.5 },
      ],
      interpolation: 'linear',
    };
    const result = applyTonalChain({
      channels: [makeChannel({ commanded: Uint16Array.from([0, 65535]), trc })],
    });

    expect(result.status).toBe('accepted');
    const k = channelOf(result);
    expect(k.trcApplied).toBe(true);
    expect(k.trc.points).toEqual(trc.points);
    expect(k.corrected[0]).toBe(0);
    expect(k.corrected[1]).toBe(FX(0.5));
  });

  it('applies a stepped curve, holding the flat region and ramping afterwards', () => {
    const trc: ToneReproductionCurve = {
      points: [
        { input: 0, output: 0 },
        { input: 0.5, output: 0 },
        { input: 1, output: 1 },
      ],
      interpolation: 'linear',
    };
    const result = applyTonalChain({
      channels: [makeChannel({ commanded: Uint16Array.from([0, 32767, 49151, 65535]), trc })],
    });

    const k = channelOf(result);
    expect(k.corrected[0]).toBe(0);
    expect(k.corrected[1]).toBe(0); // flat region below 0.5
    expect(k.corrected[2]).toBeGreaterThan(30000); // mid-ramp
    expect(k.corrected[2]).toBeLessThan(35000);
    expect(k.corrected[3]).toBe(65535);
  });

  it('treats an empty control-point list as identity', () => {
    const trc: ToneReproductionCurve = { points: [], interpolation: 'linear' };
    const result = applyTonalChain({
      channels: [makeChannel({ commanded: Uint16Array.from([0, 16384, 65535]), trc })],
    });

    expect(result.status).toBe('accepted');
    expect(Array.from(channelOf(result).corrected)).toEqual([0, 16384, 65535]);
  });

  it('rejects duplicate control-point inputs as ambiguous', () => {
    const trc: ToneReproductionCurve = {
      points: [
        { input: 0, output: 0 },
        { input: 0.5, output: 0.5 },
        { input: 0.5, output: 0.7 },
      ],
      interpolation: 'linear',
    };
    const result = applyTonalChain({
      channels: [makeChannel({ commanded: Uint16Array.from([0, 65535]), trc })],
    });

    expect(result.status).toBe('rejected');
    expect(codes(result)).toContain('channel.trc_ambiguous');
    expect('channels' in result).toBe(false);
  });

  it('rejects non-increasing control-point inputs', () => {
    const trc: ToneReproductionCurve = {
      points: [
        { input: 0, output: 0 },
        { input: 0.6, output: 0.5 },
        { input: 0.4, output: 0.7 },
      ],
      interpolation: 'linear',
    };
    const result = applyTonalChain({
      channels: [makeChannel({ commanded: Uint16Array.from([0, 65535]), trc })],
    });

    expect(result.status).toBe('rejected');
    expect(codes(result)).toContain('channel.trc_ambiguous');
  });

  it('rejects an out-of-range control point', () => {
    const trc: ToneReproductionCurve = {
      points: [
        { input: 0, output: 0 },
        { input: 1.5, output: 0.5 },
      ],
      interpolation: 'linear',
    };
    const result = applyTonalChain({
      channels: [makeChannel({ commanded: Uint16Array.from([0, 65535]), trc })],
    });

    expect(result.status).toBe('rejected');
    expect(codes(result)).toContain('channel.trc_out_of_range');
  });

  it('reports non-monotonic output as informational, not a rejection', () => {
    const trc: ToneReproductionCurve = {
      points: [
        { input: 0, output: 1 },
        { input: 0.5, output: 0 },
        { input: 1, output: 1 },
      ],
      interpolation: 'linear',
    };
    const result = applyTonalChain({
      channels: [makeChannel({ commanded: Uint16Array.from([0, 32768, 65535]), trc })],
    });

    expect(result.status).toBe('accepted');
    const issue = result.issues.find((entry) => entry.code === 'channel.trc_non_monotonic');
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe('info');
  });
});

describe('reproduction limits', () => {
  const limits: ReproductionLimits = { a_wf: 1000 / 65535, a_vf: 2000 / 65535 };

  it('maps a_corrected <= a_wf to 0 and a_corrected >= a_vf to 1 at the exact boundaries', () => {
    const result = applyTonalChain({
      channels: [makeChannel({ commanded: Uint16Array.from([1000, 2000]), limits })],
    });

    expect(result.status).toBe('accepted');
    const k = channelOf(result);
    expect(k.limitsApplied).toBe(true);
    expect(k.reproducible[0]).toBe(0);
    expect(k.reproducible[1]).toBe(65535);
  });

  it('interpolates the interval linearly and clamps just outside', () => {
    const result = applyTonalChain({
      channels: [makeChannel({ commanded: Uint16Array.from([999, 1500, 2001]), limits })],
    });

    const k = channelOf(result);
    const mid = k.reproducible[1] ?? Number.NaN;
    expect(k.reproducible[0]).toBe(0); // just below a_wf
    // The midpoint remap is ~0.5 in IEEE-754 double; round-half-up quantises it
    // to one of the two adjacent 16-bit values depending on float rounding.
    expect(mid / 65535).toBeCloseTo(0.5, 4);
    expect([32767, 32768]).toContain(mid);
    expect(k.reproducible[2]).toBe(65535); // just above a_vf
  });

  it('preserves a_commanded and a_corrected; a_reproducible is independent', () => {
    const commanded = Uint16Array.from([0, 1500, 3000, 65535]);
    const withLimits = applyTonalChain({ channels: [makeChannel({ commanded, limits })] });
    const withoutLimits = applyTonalChain({
      channels: [makeChannel({ commanded: Uint16Array.from(commanded) })],
    });

    const k = channelOf(withLimits);
    const identity = channelOf(withoutLimits);
    // Commanded and corrected are untouched by the limit stage.
    expect(Array.from(k.commanded)).toEqual(Array.from(commanded));
    expect(Array.from(k.corrected)).toEqual(Array.from(identity.corrected));
    // The reproducible stage differs and is not an alias of corrected.
    expect(Array.from(k.reproducible)).not.toEqual(Array.from(k.corrected));
  });

  it('records identity limits and warns when no limits are configured', () => {
    const result = applyTonalChain({
      channels: [makeChannel({ commanded: Uint16Array.from([0, 65535]) })],
    });

    expect(result.status).toBe('accepted');
    expect(channelOf(result).limitsApplied).toBe(false);
    expect(codes(result)).toContain('channel.limits_identity');
    const warning = result.issues.find((issue) => issue.code === 'channel.limits_identity');
    expect(warning?.severity).toBe('warning');
  });

  it('rejects out-of-range limits', () => {
    const result = applyTonalChain({
      channels: [
        makeChannel({
          commanded: Uint16Array.from([0, 65535]),
          limits: { a_wf: -0.1, a_vf: 0.8 },
        }),
      ],
    });

    expect(result.status).toBe('rejected');
    expect(codes(result)).toContain('channel.limits_invalid');
  });

  it('rejects inverted limits (a_wf >= a_vf)', () => {
    const result = applyTonalChain({
      channels: [
        makeChannel({
          commanded: Uint16Array.from([0, 65535]),
          limits: { a_wf: 0.8, a_vf: 0.2 },
        }),
      ],
    });

    expect(result.status).toBe('rejected');
    expect(codes(result)).toContain('channel.limits_invalid');
  });
});

describe('stage summaries and quantisation', () => {
  it('summarises each stage with min, max, mean and counts at the bounds', () => {
    const result = applyTonalChain({
      channels: [makeChannel({ commanded: Uint16Array.from([0, 65535, 0, 65535]) })],
    });

    const k = channelOf(result);
    expect(k.summaries.commanded.min).toBe(0);
    expect(k.summaries.commanded.max).toBe(1);
    expect(k.summaries.commanded.mean).toBeCloseTo(0.5, 6);
    expect(k.summaries.commanded.atZero).toBe(2);
    expect(k.summaries.commanded.atOne).toBe(2);
    expect(k.summaries.reproducible).toEqual(k.summaries.commanded);
  });

  it('quantises with a single round-half-up rule', () => {
    // A TRC that maps the input midpoint to exactly 0.5 produces 32768, not 32767.
    const trc: ToneReproductionCurve = {
      points: [
        { input: 0, output: 0.5 },
        { input: 1, output: 0.5 },
      ],
      interpolation: 'linear',
    };
    const result = applyTonalChain({
      channels: [makeChannel({ commanded: Uint16Array.from([0, 65535]), trc })],
    });

    expect(channelOf(result).corrected[0]).toBe(FX(0.5));
    expect(FX(0.5)).toBe(32768);
  });
});

describe('stage preconditions and issue contract', () => {
  it('rejects a non-list channel set instead of throwing', () => {
    const result = applyTonalChain({ channels: undefined as unknown as never });

    expect(result.status).toBe('rejected');
    expect(codes(result)).toContain('channel.tonal_input_invalid');
  });

  it('rejects a commanded stage that is not a 16-bit array', () => {
    const result = applyTonalChain({
      channels: [{ id: 'k', commanded: [0, 65535] as unknown as Uint16Array }],
    });

    expect(result.status).toBe('rejected');
    expect(codes(result)).toContain('channel.tonal_input_invalid');
  });

  it('rejects a channel with no samples', () => {
    const result = applyTonalChain({ channels: [makeChannel({ commanded: new Uint16Array(0) })] });

    expect(result.status).toBe('rejected');
    expect(codes(result)).toContain('channel.tonal_input_invalid');
  });

  it('emits only registered channel-scope issues', () => {
    const results = [
      applyTonalChain({ channels: [makeChannel()] }),
      applyTonalChain({
        channels: [
          makeChannel({
            trc: {
              points: [
                { input: 0, output: 0 },
                { input: 0, output: 1 },
              ],
              interpolation: 'linear',
            },
          }),
        ],
      }),
      applyTonalChain({
        channels: [makeChannel({ limits: { a_wf: 0.9, a_vf: 0.1 } })],
      }),
    ];

    const issues = results.flatMap((result) => result.issues);
    expect(issues.length).toBeGreaterThan(0);
    for (const issue of issues) {
      expect(isRegisteredIssueCode(issue.code)).toBe(true);
      expect(issue.scope).toBe('channel');
    }
  });
});

describe('corrections from technical review', () => {
  it('clamps commanded values outside the control-point domain to the endpoint outputs', () => {
    const trc: ToneReproductionCurve = {
      points: [
        { input: 0.2, output: 0.8 },
        { input: 0.8, output: 0.2 },
      ],
      interpolation: 'linear',
    };
    const result = applyTonalChain({
      channels: [makeChannel({ commanded: Uint16Array.from([0, 65535]), trc })],
    });

    const k = channelOf(result);
    expect(k.corrected[0]).toBe(FX(0.8)); // below first input -> first output
    expect(k.corrected[1]).toBe(FX(0.2)); // above last input -> last output
  });

  it('skips out-of-range and non-integer sample indices in the trace', () => {
    const result = applyTonalChain({
      channels: [makeChannel({ commanded: Uint16Array.from([10, 20]) })],
    });

    const trace = traceTonalChain(channelOf(result), { samples: [-1, 0, 1.5, 2, 99] });
    expect(trace.entries.map((entry) => entry.index)).toEqual([0]);
  });

  it('applies limits to the corrected value, not the commanded value', () => {
    // TRC maps commanded 1.0 -> corrected 0.5; limits [0, 0.5] then map 0.5 -> 1.
    const trc: ToneReproductionCurve = {
      points: [
        { input: 0, output: 0 },
        { input: 1, output: 0.5 },
      ],
      interpolation: 'linear',
    };
    const limits: ReproductionLimits = { a_wf: 0, a_vf: 0.5 };
    const result = applyTonalChain({
      channels: [makeChannel({ commanded: Uint16Array.from([65535]), trc, limits })],
    });

    const k = channelOf(result);
    expect(k.corrected[0]).toBe(FX(0.5)); // TRC applied first
    expect(k.reproducible[0]).toBe(65535); // limits applied to corrected (0.5 -> 1)
  });

  it('rejects a null TRC and a null limits object without throwing', () => {
    const nullTrc = applyTonalChain({
      channels: [makeChannel({ trc: null as unknown as ToneReproductionCurve })],
    });
    expect(nullTrc.status).toBe('rejected');
    expect(codes(nullTrc)).toContain('channel.tonal_input_invalid');

    const nullLimits = applyTonalChain({
      channels: [makeChannel({ limits: null as unknown as ReproductionLimits })],
    });
    expect(nullLimits.status).toBe('rejected');
    expect(codes(nullLimits)).toContain('channel.tonal_input_invalid');
  });

  it('rejects a TRC whose control point is null instead of throwing', () => {
    const trc = {
      points: [null],
      interpolation: 'linear',
    } as unknown as ToneReproductionCurve;
    const result = applyTonalChain({ channels: [makeChannel({ trc })] });

    expect(result.status).toBe('rejected');
    expect(codes(result)).toContain('channel.tonal_input_invalid');
  });

  it('records an independent TRC snapshot unaffected by later mutation', () => {
    const points = [
      { input: 0, output: 0 },
      { input: 1, output: 0.5 },
    ];
    const trc: ToneReproductionCurve = { points, interpolation: 'linear' };
    const result = applyTonalChain({
      channels: [makeChannel({ commanded: Uint16Array.from([65535]), trc })],
    });
    const k = channelOf(result);

    // Mutating the caller's input after the run must not change the recorded stage.
    const second = points[1];
    if (second !== undefined) second.output = 0.1;
    expect(k.trc.points[1]?.output).toBe(0.5);
    expect(k.corrected[0]).toBe(FX(0.5));
  });
});
