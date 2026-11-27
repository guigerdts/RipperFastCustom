/**
 * Baseline recording and comparison for the halftone performance benchmark.
 *
 * The first run records a baseline on the declared reference environment. Later
 * changes compare against it with a relative threshold; no absolute wall-clock
 * budget is invented before a baseline exists.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { fixtureById } from './fixtures';
import {
  benchmarkEnvironment,
  environmentFingerprint,
  type BenchmarkEnvironment,
} from './environment';
import {
  declaredMemoryBudget,
  FIXED_POINT_PLANE_BYTES_PER_SAMPLE,
  GC_LAG_BYTES_PER_PIXEL,
  NORMALISED_PLANE_BYTES_PER_SAMPLE,
  PROCESS_OVERHEAD_ALLOWANCE_BYTES,
  SCALING_RATIO_BOUND,
  TONAL_PLANES_PER_CHANNEL,
} from './memory-model';
import type { FixtureMeasurement } from './measure';

export const BASELINE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'baseline.json',
);

export const RELATIVE_REGRESSION_THRESHOLD = 1.6;

const MEMORY_MODEL_NOTE =
  'Reference implementation keeps full-image stage planes; the bound is input + output + full-image workspace + a fixed process overhead. A streaming per-row bound is a separate optimisation change.';

export interface BaselineFixtureEntry {
  readonly id: string;
  readonly megapixels: number;
  readonly channels: number;
  readonly bitDepth: number;
  readonly width: number;
  readonly height: number;
  readonly status: 'recorded' | 'unavailable';
  readonly iterations?: number;
  readonly medianMs?: number;
  readonly minMs?: number;
  readonly maxMs?: number;
  readonly samplesMs?: readonly number[];
  readonly fixturePrepMs?: number;
  readonly peakAdditionalBytes?: number;
  readonly maxRssBytes?: number;
  readonly retainedArrayBuffersBytes?: number;
  readonly rasterBytes?: number;
  readonly rasterSha256?: string | null;
  readonly snapshotSha256?: string | null;
  readonly declaredBoundBytes?: number;
  readonly setupMs?: number;
  readonly averageChannelMs?: number;
  readonly reason?: string;
}

export interface BaselineDocument {
  readonly schemaVersion: 1;
  readonly declaredAt: string;
  readonly environment: BenchmarkEnvironment;
  readonly environmentFingerprint: string;
  readonly relativeRegressionThreshold: number;
  readonly memoryModel: {
    readonly processOverheadAllowanceBytes: number;
    readonly normalisedPlaneBytesPerSample: number;
    readonly fixedPointPlaneBytesPerSample: number;
    readonly tonalPlanesPerChannel: number;
    readonly gcLagBytesPerPixel: number;
    readonly note: string;
  };
  readonly fixtures: readonly BaselineFixtureEntry[];
}

export function toBaselineEntry(
  measurement: FixtureMeasurement,
  options: { readonly setupMs?: number } = {},
): BaselineFixtureEntry {
  const budget = declaredMemoryBudget(measurement.spec);
  const averageChannelMs =
    options.setupMs === undefined
      ? undefined
      : (measurement.medianMs - options.setupMs) / measurement.spec.channels;

  return {
    id: measurement.spec.id,
    megapixels: measurement.spec.megapixels,
    channels: measurement.spec.channels,
    bitDepth: measurement.spec.bitDepth,
    width: measurement.spec.width,
    height: measurement.spec.height,
    status: 'recorded',
    iterations: measurement.samplesMs.length,
    medianMs: round(measurement.medianMs),
    minMs: round(measurement.minMs),
    maxMs: round(measurement.maxMs),
    samplesMs: measurement.samplesMs.map(round),
    fixturePrepMs: round(measurement.fixturePrepMs),
    peakAdditionalBytes: measurement.peakAdditionalBytes,
    maxRssBytes: measurement.maxRssBytes,
    retainedArrayBuffersBytes: measurement.retainedArrayBuffersBytes,
    rasterBytes: measurement.rasterBytes,
    rasterSha256: measurement.rasterSha256,
    snapshotSha256: measurement.snapshotSha256,
    declaredBoundBytes: budget.totalBoundBytes,
    ...(options.setupMs === undefined ? {} : { setupMs: round(options.setupMs) }),
    ...(averageChannelMs === undefined ? {} : { averageChannelMs: round(averageChannelMs) }),
  };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function unavailableEntry(id: string, reason: string): BaselineFixtureEntry {
  const spec = fixtureById(id);
  return {
    id: spec.id,
    megapixels: spec.megapixels,
    channels: spec.channels,
    bitDepth: spec.bitDepth,
    width: spec.width,
    height: spec.height,
    status: 'unavailable',
    reason,
  };
}

export function loadBaseline(): BaselineDocument {
  return JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as BaselineDocument;
}

export function writeBaseline(document: BaselineDocument): void {
  writeFileSync(BASELINE_PATH, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
}

export function buildBaselineDocument(
  entries: readonly BaselineFixtureEntry[],
  options: { readonly declaredAt?: string } = {},
): BaselineDocument {
  const environment = benchmarkEnvironment();
  return {
    schemaVersion: 1,
    declaredAt: options.declaredAt ?? new Date().toISOString(),
    environment,
    environmentFingerprint: environmentFingerprint(environment),
    relativeRegressionThreshold: RELATIVE_REGRESSION_THRESHOLD,
    memoryModel: {
      processOverheadAllowanceBytes: PROCESS_OVERHEAD_ALLOWANCE_BYTES,
      normalisedPlaneBytesPerSample: NORMALISED_PLANE_BYTES_PER_SAMPLE,
      fixedPointPlaneBytesPerSample: FIXED_POINT_PLANE_BYTES_PER_SAMPLE,
      tonalPlanesPerChannel: TONAL_PLANES_PER_CHANNEL,
      gcLagBytesPerPixel: GC_LAG_BYTES_PER_PIXEL,
      note: MEMORY_MODEL_NOTE,
    },
    fixtures: entries,
  };
}

export interface BaselineComparison {
  readonly ratio: number;
  readonly regressed: boolean;
  readonly threshold: number;
}

/**
 * Compares one measurement with the recorded baseline. The threshold is a
 * relative regression bound, never an absolute wall-clock budget.
 */
export function compareToBaseline(
  actualMs: number,
  baselineMs: number,
  threshold: number = RELATIVE_REGRESSION_THRESHOLD,
): BaselineComparison {
  if (!(baselineMs > 0)) throw new Error('baseline elapsed time must be positive');
  if (!(threshold > 0)) throw new Error('regression threshold must be positive');
  const ratio = actualMs / baselineMs;
  return { ratio, regressed: ratio > threshold, threshold };
}

export interface ScalingComparison {
  readonly ratio: number;
  readonly withinBound: boolean;
  readonly bound: number;
}

/**
 * Compares a quadrupled-output run with its smaller sibling. The bound allows
 * four times the work plus constant overhead; it is a contract, not a guess.
 */
export function compareScaling(
  baseMs: number,
  quadrupledMs: number,
  bound: number = SCALING_RATIO_BOUND,
): ScalingComparison {
  if (!(baseMs > 0)) throw new Error('base elapsed time must be positive');
  if (!(bound > 0)) throw new Error('scaling bound must be positive');
  const ratio = quadrupledMs / baseMs;
  return { ratio, withinBound: ratio <= bound, bound };
}
