// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { makeSmokeFixture, type FixtureChannelCount } from './fixtures';
import {
  declaredMemoryBudget,
  measureFixture,
  withinDeclaredMemoryBound,
  type FixtureMeasurement,
} from './harness';

function assertWithinBound(measurement: FixtureMeasurement): void {
  const budget = declaredMemoryBudget(measurement.spec);
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      case: `memory-${measurement.spec.id}`,
      pixels: measurement.spec.width * measurement.spec.height,
      peakAdditionalBytes: measurement.peakAdditionalBytes,
      maxRssBytes: measurement.maxRssBytes,
      retainedArrayBuffersBytes: measurement.retainedArrayBuffersBytes,
      declaredBoundBytes: budget.totalBoundBytes,
    }),
  );

  expect(measurement.status).toBe('completed');
  expect(withinDeclaredMemoryBound(measurement)).toBe(true);
  expect(measurement.peakAdditionalBytes).toBeLessThanOrEqual(budget.totalBoundBytes);
  expect(measurement.rasterBytes).toBe(
    measurement.spec.width * measurement.spec.height * measurement.spec.channels,
  );
}

describe('performance memory', () => {
  it('keeps the one-channel peak inside the declared bound', { timeout: 120_000 }, () => {
    assertWithinBound(measureFixture(makeSmokeFixture(250, 1)));
  });

  it('keeps the four-channel peak inside the declared bound', { timeout: 120_000 }, () => {
    assertWithinBound(measureFixture(makeSmokeFixture(250, 4)));
  });

  it('keeps the eight-channel peak inside the declared bound', { timeout: 120_000 }, () => {
    assertWithinBound(measureFixture(makeSmokeFixture(250, 8)));
  });

  it('keeps a one-megapixel peak inside the declared bound', { timeout: 180_000 }, () => {
    const channels: FixtureChannelCount = 1;
    assertWithinBound(measureFixture(makeSmokeFixture(1000, channels)));
  });
});
