// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { makeSmokeFixture, type FixtureChannelCount, type FixtureSpec } from './fixtures';
import {
  compareScaling,
  declaredMemoryBudget,
  measureFixture,
  SCALING_RATIO_BOUND,
} from './harness';

/**
 * The performance section of the spec quadruples output pixels and requires the
 * elapsed time not to exceed six times the smaller run.
 *
 * The default suite runs this on the one- and four-channel families. The
 * eight-channel pair is recorded by the baseline capture instead: on the
 * declared reference environment its larger side does not fit the default-suite
 * budget.
 *
 * Base and quadrupled runs are interleaved so a transient load on the host hits
 * both sides of the ratio instead of only one.
 */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function sample(spec: FixtureSpec): number {
  return measureFixture(spec, {
    iterations: 1,
    warmup: 1,
    warmupFixture: makeSmokeFixture(64, spec.channels, spec.bitDepth),
  }).medianMs;
}

function scalingCase(channels: FixtureChannelCount, rounds: number): void {
  const baseSpec = makeSmokeFixture(250, channels);
  const quadSpec = makeSmokeFixture(500, channels);
  const baseSamples: number[] = [];
  const quadSamples: number[] = [];

  for (let round = 0; round < rounds; round += 1) {
    baseSamples.push(sample(baseSpec));
    quadSamples.push(sample(quadSpec));
  }

  expect(quadSpec.width * quadSpec.height).toBe(4 * baseSpec.width * baseSpec.height);

  const scaling = compareScaling(median(baseSamples), median(quadSamples));
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      case: `scaling-${String(channels)}ch`,
      baseSamplesMs: baseSamples.map((value) => Math.round(value)),
      quadSamplesMs: quadSamples.map((value) => Math.round(value)),
      ratio: Number(scaling.ratio.toFixed(3)),
      bound: SCALING_RATIO_BOUND,
    }),
  );
  expect(scaling.withinBound).toBe(true);
}

describe('performance scaling', () => {
  it(
    'keeps quadrupled output pixels under six times the one-channel run',
    { timeout: 120_000 },
    () => {
      scalingCase(1, 3);
    },
  );

  it(
    'keeps quadrupled output pixels under six times the four-channel run',
    { timeout: 180_000 },
    () => {
      scalingCase(4, 2);
    },
  );

  it('declares a memory bound for every measured fixture', () => {
    for (const channels of [1, 4] as const) {
      const budget = declaredMemoryBudget(makeSmokeFixture(250, channels));
      expect(budget.totalBoundBytes).toBeGreaterThan(budget.inputBytes + budget.outputBytes);
      expect(budget.totalBoundBytes).toBeGreaterThan(budget.declaredWorkspaceBytes);
    }
  });
});
