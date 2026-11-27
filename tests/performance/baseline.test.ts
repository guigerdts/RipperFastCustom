// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { DECLARED_FIXTURES } from './fixtures';
import {
  benchmarkEnvironment,
  buildBaselineDocument,
  compareScaling,
  compareToBaseline,
  environmentFingerprint,
  loadBaseline,
  RELATIVE_REGRESSION_THRESHOLD,
  SCALING_RATIO_BOUND,
} from './harness';

describe('performance baseline', () => {
  const baseline = loadBaseline();

  it('records a declared reference environment', () => {
    expect(baseline.schemaVersion).toBe(1);
    expect(baseline.declaredAt.length).toBeGreaterThan(0);
    expect(baseline.environment.node).toMatch(/^v\d+/);
    expect(baseline.environment.cpuCount).toBeGreaterThan(0);
    expect(baseline.environmentFingerprint).toBe(environmentFingerprint(baseline.environment));
    expect(baseline.relativeRegressionThreshold).toBeGreaterThan(1);
    expect(baseline.memoryModel.processOverheadAllowanceBytes).toBeGreaterThan(0);
  });

  it('covers every declared fixture exactly once', () => {
    const ids = baseline.fixtures.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(ids)).toEqual(new Set(DECLARED_FIXTURES.map((entry) => entry.id)));
  });

  it('records real numbers for recorded fixtures and a reason for unavailable ones', () => {
    for (const entry of baseline.fixtures) {
      if (entry.status === 'recorded') {
        expect(entry.medianMs).toBeGreaterThan(0);
        expect(entry.iterations).toBeGreaterThan(0);
        expect(entry.declaredBoundBytes).toBeGreaterThan(0);
        expect(entry.rasterSha256).toMatch(/^[0-9a-f]{64}$/);
        expect(entry.snapshotSha256).toMatch(/^[0-9a-f]{64}$/);
      } else {
        expect(entry.reason?.length ?? 0).toBeGreaterThan(0);
      }
    }
  });

  it('flags a simulated regression against the relative threshold', () => {
    const recorded = baseline.fixtures.find((entry) => entry.status === 'recorded');
    if (recorded === undefined || recorded.medianMs === undefined) {
      throw new Error('baseline has no recorded fixture to compare');
    }

    const identical = compareToBaseline(recorded.medianMs, recorded.medianMs);
    expect(identical.regressed).toBe(false);
    expect(identical.ratio).toBe(1);

    const regression = compareToBaseline(
      recorded.medianMs * (RELATIVE_REGRESSION_THRESHOLD + 1),
      recorded.medianMs,
    );
    expect(regression.regressed).toBe(true);
    expect(regression.ratio).toBeGreaterThan(RELATIVE_REGRESSION_THRESHOLD);
  });

  it('enforces the four-times-pixels scaling bound', () => {
    const within = compareScaling(100, 400);
    expect(within.withinBound).toBe(true);
    expect(within.ratio).toBe(4);

    const over = compareScaling(100, SCALING_RATIO_BOUND * 100 + 1);
    expect(over.withinBound).toBe(false);
  });

  it('builds a schema-valid document from entries', () => {
    const document = buildBaselineDocument(baseline.fixtures);
    expect(document.schemaVersion).toBe(1);
    expect(document.environmentFingerprint).toBe(environmentFingerprint(document.environment));
    expect(document.fixtures).toHaveLength(baseline.fixtures.length);
  });

  it('reports whether the recorded environment matches the current one', () => {
    const current = environmentFingerprint(benchmarkEnvironment());
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        case: 'baseline-environment',
        recorded: baseline.environmentFingerprint,
        current,
        matches: current === baseline.environmentFingerprint,
      }),
    );
    expect(current.length).toBeGreaterThan(0);
  });
});
