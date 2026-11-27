/**
 * Measurement primitives for the halftone performance benchmark.
 *
 * The harness is test-side code: it may read clocks and the process, while the
 * engine it measures stays pure.
 *
 * Memory is recorded with two numbers per fixture:
 *
 * - `peakAdditionalBytes` is the rise of the process high-water mark (`maxRSS`)
 *   above the RSS sampled immediately before the fixture was built. It is the
 *   conservative peak, because the kernel's high-water mark can never be lower
 *   than the true peak resident set.
 * - `retainedArrayBuffersBytes` is the change in live `ArrayBuffer` bytes after
 *   the run. It is used by the repeated-run cache check.
 */

import { createHash } from 'node:crypto';

import type { ScreeningResult } from '../../src/engines/halftone/contracts';
import { assembleScreeningResult } from '../../src/engines/halftone/result';
import { snapshotCanonicalText } from '../../src/engines/halftone/snapshot';
import type { BuiltFixture, FixtureSpec } from './fixtures';
import { buildFixture } from './fixtures';
import { declaredMemoryBudget } from './memory-model';

const PROCESS_BASELINE_RSS_BYTES = process.memoryUsage().rss;

interface MemorySnapshot {
  readonly rssBytes: number;
  readonly arrayBuffersBytes: number;
  readonly maxRssBytes: number;
}

function memorySnapshot(): MemorySnapshot {
  const usage = process.memoryUsage();
  return {
    rssBytes: usage.rss,
    arrayBuffersBytes: usage.arrayBuffers,
    maxRssBytes: process.resourceUsage().maxRSS * 1024,
  };
}

function collectGarbage(): void {
  const runtime = globalThis as { gc?: () => void };
  runtime.gc?.();
}

export interface FixtureMeasurement {
  readonly spec: FixtureSpec;
  readonly status: ScreeningResult['status'];
  readonly fixturePrepMs: number;
  readonly samplesMs: readonly number[];
  readonly medianMs: number;
  readonly minMs: number;
  readonly maxMs: number;
  readonly peakAdditionalBytes: number;
  readonly maxRssBytes: number;
  readonly processBaselineRssBytes: number;
  readonly retainedArrayBuffersBytes: number;
  readonly rasterBytes: number;
  readonly rasterSha256: string | null;
  readonly snapshotSha256: string | null;
  readonly issues: number;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const value = sorted[middle];
  return value ?? 0;
}

function fingerprint(result: ScreeningResult): {
  rasterSha256: string | null;
  snapshotSha256: string | null;
} {
  if (result.status !== 'completed') return { rasterSha256: null, snapshotSha256: null };

  const rasterHash = createHash('sha256');
  for (const raster of result.rasters) {
    rasterHash.update(raster.channelId);
    rasterHash.update(`${String(raster.width)}x${String(raster.height)}`);
    rasterHash.update(raster.data);
  }

  return {
    rasterSha256: rasterHash.digest('hex'),
    snapshotSha256: createHash('sha256')
      .update(snapshotCanonicalText(result.snapshot))
      .digest('hex'),
  };
}

export interface MeasureOptions {
  readonly iterations?: number;
  readonly warmup?: number;
  /** Blank runs before measurement, so one-time module work is excluded. */
  readonly warmupFixture?: FixtureSpec;
}

/**
 * Runs one fixture through the public engine seam and records elapsed time and
 * peak memory. Fixtures should be measured in ascending pixel-count order so the
 * process high-water mark is meaningful for every entry.
 */
export function measureFixture(
  spec: FixtureSpec,
  options: MeasureOptions = {},
): FixtureMeasurement {
  if (options.warmupFixture !== undefined) {
    const warm = buildFixture(options.warmupFixture);
    for (let index = 0; index < (options.warmup ?? 1); index += 1) {
      assembleScreeningResult({
        request: { input: warm.input, profile: warm.profile, output: { dpi: 300 } },
      });
    }
    collectGarbage();
  }

  const before = memorySnapshot();
  const prepStart = performance.now();
  const built: BuiltFixture = buildFixture(spec);
  const fixturePrepMs = performance.now() - prepStart;

  for (let index = 0; index < (options.warmup ?? 0); index += 1) {
    assembleScreeningResult({
      request: { input: built.input, profile: built.profile, output: { dpi: 300 } },
    });
    collectGarbage();
  }

  const samplesMs: number[] = [];
  let last: ScreeningResult | null = null;

  for (let index = 0; index < (options.iterations ?? 1); index += 1) {
    const start = performance.now();
    last = assembleScreeningResult({
      request: { input: built.input, profile: built.profile, output: { dpi: 300 } },
    });
    samplesMs.push(performance.now() - start);
  }

  const after = memorySnapshot();
  if (last === null) throw new Error(`fixture ${spec.id} produced no result`);

  const rasters = last.status === 'completed' ? last.rasters : [];
  const printed = fingerprint(last);

  return {
    spec,
    status: last.status,
    fixturePrepMs,
    samplesMs,
    medianMs: median(samplesMs),
    minMs: Math.min(...samplesMs),
    maxMs: Math.max(...samplesMs),
    peakAdditionalBytes: Math.max(0, after.maxRssBytes - before.rssBytes),
    maxRssBytes: after.maxRssBytes,
    processBaselineRssBytes: PROCESS_BASELINE_RSS_BYTES,
    retainedArrayBuffersBytes: Math.max(0, after.arrayBuffersBytes - before.arrayBuffersBytes),
    rasterBytes: rasters.reduce((total, raster) => total + raster.data.length, 0),
    rasterSha256: printed.rasterSha256,
    snapshotSha256: printed.snapshotSha256,
    issues: last.issues.length,
  };
}

/**
 * True when the run stayed inside the declared bound. The comparison uses the
 * absolute high-water mark above the process baseline captured at import time,
 * so it stays monotonic even when several fixtures share one process.
 */
export function withinDeclaredMemoryBound(measurement: FixtureMeasurement): boolean {
  const budget = declaredMemoryBudget(measurement.spec);
  return measurement.maxRssBytes - measurement.processBaselineRssBytes <= budget.totalBoundBytes;
}

/**
 * Cancels right after the pipeline's setup stages, so the difference from a full
 * run attributes the remaining time to per-channel screening. The entry check
 * consumes call 1; call 2 is row 1 of the first channel.
 */
export function measureSetupMs(spec: FixtureSpec): number {
  const built = buildFixture(spec);
  let calls = 0;
  const start = performance.now();
  assembleScreeningResult({
    request: { input: built.input, profile: built.profile, output: { dpi: 300 } },
    isCancelled: () => {
      calls += 1;
      return calls >= 2;
    },
  });
  return performance.now() - start;
}
