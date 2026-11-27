// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { assembleScreeningResult } from '../../src/engines/halftone/result';
import { buildFixture, makeSmokeFixture } from './fixtures';

/** Slack for allocator noise between runs of a tiny fixture. */
const RETAINED_GROWTH_ALLOWANCE_BYTES = 4 * 1024 * 1024;

function runOnce(built: ReturnType<typeof buildFixture>): Uint8Array {
  const result = assembleScreeningResult({
    request: { input: built.input, profile: built.profile, output: { dpi: 300 } },
  });
  expect(result.status).toBe('completed');
  if (result.status !== 'completed') throw new Error('expected a completed result');
  const raster = result.rasters[0];
  if (raster === undefined) throw new Error('expected at least one raster');
  return raster.data;
}

describe('performance cache', () => {
  it(
    'does not accumulate global state or retained buffers across repeated runs',
    { timeout: 60_000 },
    () => {
      const built = buildFixture(makeSmokeFixture(128, 1));
      const retained: number[] = [];
      let previous: Uint8Array | null = null;

      for (let run = 0; run < 3; run += 1) {
        const raster = runOnce(built);
        if (previous !== null) {
          expect(Array.from(raster)).toEqual(Array.from(previous));
        }
        previous = raster;
        retained.push(process.memoryUsage().arrayBuffers);
      }

      const growth = (retained[retained.length - 1] ?? 0) - (retained[0] ?? 0);
      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify({ case: 'cache-repeated-runs', retainedArrayBuffers: retained, growth }),
      );
      expect(growth).toBeLessThan(RETAINED_GROWTH_ALLOWANCE_BYTES);
    },
  );
});
