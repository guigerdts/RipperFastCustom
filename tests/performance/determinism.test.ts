// @vitest-environment node

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { assembleScreeningResult } from '../../src/engines/halftone/result';
import type { CompletedResult, ScreeningResult } from '../../src/engines/halftone/contracts';
import { snapshotCanonicalText } from '../../src/engines/halftone/snapshot';
import { buildFixture, makeSmokeFixture, type FixtureChannelCount } from './fixtures';

function completed(result: ScreeningResult): CompletedResult {
  expect(result.status).toBe('completed');
  if (result.status !== 'completed') throw new Error('expected a completed result');
  return result;
}

function rasterHash(result: CompletedResult): string {
  const hash = createHash('sha256');
  for (const raster of result.rasters) {
    hash.update(raster.channelId);
    hash.update(`${String(raster.width)}x${String(raster.height)}`);
    hash.update(raster.data);
  }
  return hash.digest('hex');
}

function run(
  spec: Parameters<typeof buildFixture>[0],
  tiles?: readonly { x: number; y: number; width: number; height: number }[],
) {
  const built = buildFixture(spec);
  const before = built.input.data.slice();
  const result = completed(
    assembleScreeningResult({
      request: { input: built.input, profile: built.profile, output: { dpi: 300 } },
      ...(tiles === undefined ? {} : { tiles }),
    }),
  );
  const unchanged = before.every((value, index) => value === built.input.data[index]);
  return { result, unchanged };
}

function determinismCase(channels: FixtureChannelCount): void {
  const spec = makeSmokeFixture(250, channels);
  const first = run(spec);
  const second = run(spec);

  expect(first.unchanged).toBe(true);
  expect(second.unchanged).toBe(true);
  expect(first.result.rasters).toHaveLength(channels);
  expect(rasterHash(first.result)).toBe(rasterHash(second.result));
  expect(snapshotCanonicalText(first.result.snapshot)).toBe(
    snapshotCanonicalText(second.result.snapshot),
  );

  const half = Math.floor(spec.width / 2);
  const tiled = run(spec, [
    { x: 0, y: 0, width: half, height: spec.height },
    { x: half, y: 0, width: spec.width - half, height: spec.height },
  ]);
  expect(tiled.unchanged).toBe(true);
  expect(rasterHash(tiled.result)).toBe(rasterHash(first.result));
}

describe('performance reference identity', () => {
  it(
    'is byte-identical across runs and between whole-image and tiled runs',
    { timeout: 120_000 },
    () => {
      determinismCase(1);
      determinismCase(4);
    },
  );
});
