// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { loadBaseline } from '../performance/baseline';
import { DECLARED_FIXTURES, makeSmokeFixture } from '../performance/fixtures';
import { measureFixture, withinDeclaredMemoryBound } from '../performance/measure';

/**
 * Acceptance matrix, part 4: benchmark record (spec criterion 20).
 *
 * The default suite measures one declared fixture and checks the recorded time,
 * peak memory and declared bound. The full 1/4/16 MP matrix, its scaling checks
 * and its memory bounds live in `tests/performance/`; this case proves the
 * benchmark record is complete and honest without pretending to be a second
 * benchmark suite.
 */

describe('spec AC20: recorded benchmark', () => {
  it('records elapsed time and peak memory inside the declared bound', { timeout: 120_000 }, () => {
    const spec = makeSmokeFixture(250, 1);
    const measurement = measureFixture(spec, {
      iterations: 1,
      warmup: 1,
      warmupFixture: makeSmokeFixture(64, 1),
    });

    expect(measurement.status).toBe('completed');
    expect(measurement.samplesMs).toHaveLength(1);
    expect(Number.isFinite(measurement.medianMs)).toBe(true);
    expect(measurement.medianMs).toBeGreaterThanOrEqual(0);
    expect(measurement.peakAdditionalBytes).toBeGreaterThanOrEqual(0);
    expect(measurement.maxRssBytes).toBeGreaterThan(0);
    expect(measurement.rasterBytes).toBe(spec.width * spec.height * spec.channels);
    expect(withinDeclaredMemoryBound(measurement)).toBe(true);
    expect(measurement.rasterSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(measurement.snapshotSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('keeps the baseline complete for every declared fixture', () => {
    const baseline = loadBaseline();

    expect(baseline.schemaVersion).toBe(1);
    expect(baseline.relativeRegressionThreshold).toBeGreaterThan(0);
    expect(baseline.fixtures).toHaveLength(DECLARED_FIXTURES.length);

    for (const fixture of DECLARED_FIXTURES) {
      const entry = baseline.fixtures.find((candidate) => candidate.id === fixture.id);
      expect(entry, fixture.id).toBeDefined();
      if (entry === undefined) continue;
      expect(entry.width).toBe(fixture.width);
      expect(entry.height).toBe(fixture.height);
      expect(entry.channels).toBe(fixture.channels);
      expect(entry.bitDepth).toBe(fixture.bitDepth);
      if (entry.status === 'recorded') {
        expect(entry.medianMs, fixture.id).toBeGreaterThan(0);
        expect(entry.rasterSha256, fixture.id).toMatch(/^[0-9a-f]{64}$/);
        expect(entry.snapshotSha256, fixture.id).toMatch(/^[0-9a-f]{64}$/);
      } else {
        expect(entry.reason, fixture.id).toBeTruthy();
      }
    }
  });

  it('declares the full-image memory model and its known streaming gap', () => {
    const baseline = loadBaseline();
    expect(baseline.memoryModel.note).toContain('full-image');
    expect(baseline.memoryModel.note).toContain('streaming');
    expect(baseline.memoryModel.processOverheadAllowanceBytes).toBeGreaterThan(0);
    expect(baseline.memoryModel.tonalPlanesPerChannel).toBeGreaterThan(0);
  });
});
