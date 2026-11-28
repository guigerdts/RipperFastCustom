// @vitest-environment node

import { describe, expect, it } from 'vitest';

import type { ChannelRaster, ScreeningResult } from '../../src/engines/halftone/contracts';
import { snapshotCanonicalText } from '../../src/engines/halftone/snapshot';
import {
  grayProfile,
  rampInput,
  rasterDigest,
  rgbInput,
  rgbProfile,
  run,
  type RunOptions,
} from './fixtures';

/**
 * Whole-image versus tiled identity and the declared determinism scope.
 *
 * Every assertion goes through the single seam. Byte identity is only claimed
 * for the same runtime and the declared numeric environment; a cross-runtime
 * comparison is tolerance-based and never claims universal binary equivalence.
 */

const RUNTIME = `${typeof process === 'object' ? process.version : 'unknown'}-${typeof process === 'object' ? process.arch : 'unknown'}`;
/** Declared numeric environment of the byte-identity claim. */
const NUMERIC_ENVIRONMENT = 'ieee754-binary64-round-to-nearest-ties-even-no-fma';
/** One 16-bit tonal quantisation step: the declared tonal tolerance. */
const TONAL_TOLERANCE = 1 / 0xffff;
/** Declared geometric tolerance for measured frequency and angle. */
const GEOMETRIC_TOLERANCE = 1e-9;

interface Environment {
  readonly runtime: string;
  readonly numeric: string;
}

const SAME_ENVIRONMENT: Environment = { runtime: RUNTIME, numeric: NUMERIC_ENVIRONMENT };

function completed(result: ScreeningResult) {
  expect(result.status).toBe('completed');
  if (result.status !== 'completed') throw new Error('expected a completed result');
  return result;
}

function summariesOf(result: ScreeningResult): string {
  const value = completed(result);
  return JSON.stringify(value.channels.map((channel) => channel.summaries));
}

function addressabilityOf(result: ScreeningResult): string {
  const value = completed(result);
  return JSON.stringify(value.channels.map((channel) => channel.addressability));
}

function snapshotText(result: ScreeningResult): string {
  return snapshotCanonicalText(completed(result).snapshot);
}

interface RasterComparison {
  readonly byteIdentical: boolean;
  readonly withinTolerance: boolean;
  readonly byteIdentityClaimed: boolean;
}

/** Compares two rasters under the declared environment and tonal tolerance. */
function compareRasters(
  left: readonly ChannelRaster[],
  right: readonly ChannelRaster[],
  leftEnvironment: Environment,
  rightEnvironment: Environment,
): RasterComparison {
  const sameEnvironment =
    leftEnvironment.runtime === rightEnvironment.runtime &&
    leftEnvironment.numeric === rightEnvironment.numeric;

  let bytesEqual = left.length === right.length;
  let withinTolerance = left.length === right.length;

  for (let index = 0; index < left.length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (a === undefined || b === undefined) {
      bytesEqual = false;
      withinTolerance = false;
      continue;
    }
    if (a.data.length !== b.data.length) {
      bytesEqual = false;
      withinTolerance = false;
      continue;
    }
    for (let pixel = 0; pixel < a.data.length; pixel += 1) {
      const leftValue = a.data[pixel] ?? 0;
      const rightValue = b.data[pixel] ?? 0;
      if (leftValue !== rightValue) bytesEqual = false;
      if (Math.abs(leftValue - rightValue) > TONAL_TOLERANCE) withinTolerance = false;
    }
  }

  return {
    byteIdentical: sameEnvironment && bytesEqual,
    withinTolerance,
    byteIdentityClaimed: sameEnvironment,
  };
}

function tiledRun(options: RunOptions, tiles: RunOptions['tiles']): ScreeningResult {
  return run({ ...options, tiles });
}

describe('whole-image and tiled identity', () => {
  const cases: ReadonlyArray<{ readonly label: string; readonly options: RunOptions }> = [
    { label: 'grayscale one channel', options: { input: rampInput(), profile: grayProfile() } },
    { label: 'rgb three channels', options: { input: rgbInput(), profile: rgbProfile() } },
  ];

  it('produces byte-identical rasters, stage summaries and snapshots', () => {
    for (const testCase of cases) {
      const whole = completed(run(testCase.options));
      const vertical = completed(verticalSplit(testCase.options));
      const quadrants = completed(
        tiledRun(testCase.options, [
          { x: 0, y: 0, width: 4, height: 4 },
          { x: 4, y: 0, width: 4, height: 4 },
          { x: 0, y: 4, width: 4, height: 4 },
          { x: 4, y: 4, width: 4, height: 4 },
        ]),
      );
      const rows = completed(
        tiledRun(
          testCase.options,
          Array.from({ length: 8 }, (_, row) => ({ x: 0, y: row, width: 8, height: 1 })),
        ),
      );

      for (const tiled of [vertical, quadrants, rows]) {
        expect(rasterDigest(tiled), testCase.label).toBe(rasterDigest(whole));
        expect(summariesOf(tiled), testCase.label).toBe(summariesOf(whole));
        expect(addressabilityOf(tiled), testCase.label).toBe(addressabilityOf(whole));
        expect(snapshotText(tiled), testCase.label).toBe(snapshotText(whole));
        expect(tiled.snapshot.hash, testCase.label).toBe(whole.snapshot.hash);
        expect(tiled.channelOrder, testCase.label).toEqual(whole.channelOrder);
      }
    }
  });

  it('does not depend on the order in which tiles are enumerated', () => {
    const options: RunOptions = { input: rgbInput(), profile: rgbProfile() };
    const forward = completed(
      tiledRun(options, [
        { x: 0, y: 0, width: 3, height: 8 },
        { x: 3, y: 0, width: 5, height: 8 },
      ]),
    );
    const reversed = completed(
      tiledRun(options, [
        { x: 3, y: 0, width: 5, height: 8 },
        { x: 0, y: 0, width: 3, height: 8 },
      ]),
    );

    expect(rasterDigest(reversed)).toBe(rasterDigest(forward));
    expect(reversed.snapshot.hash).toBe(forward.snapshot.hash);
  });

  function verticalSplit(options: RunOptions): ScreeningResult {
    return tiledRun(options, [
      { x: 0, y: 0, width: 3, height: 8 },
      { x: 3, y: 0, width: 5, height: 8 },
    ]);
  }
});

describe('declared determinism scope', () => {
  it('is byte-identical across repeated runs in the same numeric environment', () => {
    const fixtures: ReadonlyArray<RunOptions> = [
      { input: rampInput(), profile: grayProfile() },
      { input: rgbInput(), profile: rgbProfile() },
      {
        input: {
          width: 8,
          height: 8,
          ppi: 100,
          bitDepth: 16,
          layout: 'grayscale',
          data: new Uint16Array(64).map((_, index) => (index * 1013) % 0xffff),
        },
        profile: grayProfile(),
      },
    ];

    for (const options of fixtures) {
      const first = completed(run(options));
      const second = completed(run(options));
      expect(rasterDigest(second)).toBe(rasterDigest(first));
      expect(summariesOf(second)).toBe(summariesOf(first));
      expect(snapshotText(second)).toBe(snapshotText(first));
      expect(second.snapshot.hash).toBe(first.snapshot.hash);
    }
  });

  it('never mutates the caller input buffers', () => {
    const input = rampInput();
    const before = input.data.slice();
    const result = completed(run({ input }));
    expect(result.status).toBe('completed');
    expect(input.data).toEqual(before);
  });

  it('declares the numeric environment and claims byte identity only inside it', () => {
    expect(Number.EPSILON).toBe(2 ** -52);
    expect(Number.MAX_SAFE_INTEGER).toBe(2 ** 53 - 1);

    const first = completed(run({ input: rampInput(), profile: grayProfile() }));
    const second = completed(run({ input: rampInput(), profile: grayProfile() }));

    const same = compareRasters(first.rasters, second.rasters, SAME_ENVIRONMENT, SAME_ENVIRONMENT);
    expect(same.byteIdentityClaimed).toBe(true);
    expect(same.byteIdentical).toBe(true);
    expect(same.withinTolerance).toBe(true);

    const other: Environment = { runtime: 'a-different-runtime', numeric: NUMERIC_ENVIRONMENT };
    const cross = compareRasters(first.rasters, second.rasters, SAME_ENVIRONMENT, other);
    expect(cross.byteIdentityClaimed).toBe(false);
    expect(cross.byteIdentical).toBe(false);
    expect(cross.withinTolerance).toBe(true);

    const otherNumeric: Environment = { runtime: RUNTIME, numeric: 'a-different-numeric-model' };
    const crossNumeric = compareRasters(
      first.rasters,
      second.rasters,
      SAME_ENVIRONMENT,
      otherNumeric,
    );
    expect(crossNumeric.byteIdentityClaimed).toBe(false);
    expect(crossNumeric.withinTolerance).toBe(true);
  });

  it('keeps the declared geometric tolerance on a fractional lattice', () => {
    const result = completed(
      run({
        input: rampInput(),
        profile: grayProfile({
          channels: [
            {
              ...grayProfile().channels[0]!,
              screening: { method: 'am', frequency: 175, angle: 15, dotShape: 'round' },
            },
          ],
        }),
      }),
    );
    const lattice = result.snapshot.lattice;
    const measured = lattice.resolution / lattice.pitch;

    expect(Math.abs(measured - 175) / 175).toBeLessThanOrEqual(GEOMETRIC_TOLERANCE);
    expect(lattice.angle).toBe(15);
  });

  it('keeps the declared physical cell invariant across output DPI', () => {
    const cells = [100, 200, 300].map((dpi) => {
      const result = completed(run({ input: rampInput(), dpi }));
      return result.snapshot.lattice.pitch / result.snapshot.lattice.resolution;
    });

    for (const physical of cells) {
      expect(Math.abs(physical - 1 / 25)).toBeLessThanOrEqual(Number.EPSILON);
    }
  });
});

describe('tile intersection semantics', () => {
  // rampInput() and grayProfile() default to an 8x8 input at 100 PPI and
  // 100 DPI, so the output canvas is exactly 8x8 pixels.
  const OPTIONS: RunOptions = { input: rampInput(), profile: grayProfile() };
  const CANVAS = 8;

  function codesOf(result: ScreeningResult): string[] {
    return result.issues.map((issue) => issue.code);
  }

  function expectEmptyRasters(result: ReturnType<typeof completed>): void {
    expect(result.rasters.length).toBeGreaterThan(0);
    for (const raster of result.rasters) {
      expect(raster.data.length).toBe(CANVAS * CANVAS);
      expect(raster.data.every((value) => value === 0)).toBe(true);
    }
  }

  it('warns, but still completes, when a tile lies entirely beyond the canvas', () => {
    const result = completed(
      run({ ...OPTIONS, tiles: [{ x: CANVAS, y: 0, width: 4, height: 4 }] }),
    );

    const warning = result.issues.find((issue) => issue.code === 'output.tile_beyond_canvas');
    expect(warning?.severity).toBe('warning');
    expect(warning?.scope).toBe('output');
    expectEmptyRasters(result);
  });

  it('warns when a tile with negative coordinates still misses the canvas', () => {
    const result = completed(run({ ...OPTIONS, tiles: [{ x: -10, y: -10, width: 4, height: 4 }] }));

    expect(codesOf(result)).toContain('output.tile_beyond_canvas');
    expectEmptyRasters(result);
  });

  it('reports one warning per tile that misses the canvas', () => {
    const result = completed(
      run({
        ...OPTIONS,
        tiles: [
          { x: CANVAS, y: CANVAS, width: 1, height: 1 },
          { x: CANVAS * 10, y: 0, width: 1, height: 1 },
        ],
      }),
    );

    const warnings = result.issues.filter((issue) => issue.code === 'output.tile_beyond_canvas');
    expect(warnings).toHaveLength(2);
    expectEmptyRasters(result);
  });

  it('clips a partially outside tile without a warning and keeps the covered bytes', () => {
    const whole = completed(run(OPTIONS));
    const clipped = completed(
      run({ ...OPTIONS, tiles: [{ x: -2, y: 0, width: 4, height: CANVAS }] }),
    );

    expect(codesOf(clipped)).not.toContain('output.tile_beyond_canvas');

    for (let index = 0; index < whole.rasters.length; index += 1) {
      const reference = whole.rasters[index]!;
      const actual = clipped.rasters[index]!;
      for (let y = 0; y < CANVAS; y += 1) {
        for (let x = 0; x < CANVAS; x += 1) {
          const offset = y * CANVAS + x;
          const expected = x < 2 ? reference.data[offset] : 0;
          expect(actual.data[offset], `channel ${reference.channelId} at ${x},${y}`).toBe(expected);
        }
      }
    }
  });

  it('accepts an empty tile list as a valid empty selection with no diagnostic', () => {
    const result = completed(run({ ...OPTIONS, tiles: [] }));

    expect(codesOf(result)).not.toContain('output.tile_beyond_canvas');
    expectEmptyRasters(result);
  });

  it('leaves a valid full-canvas tile byte-identical to the whole-image run', () => {
    const whole = completed(run(OPTIONS));
    const tiled = completed(
      run({ ...OPTIONS, tiles: [{ x: 0, y: 0, width: CANVAS, height: CANVAS }] }),
    );

    expect(codesOf(tiled)).not.toContain('output.tile_beyond_canvas');
    expect(rasterDigest(tiled)).toBe(rasterDigest(whole));
    expect(summariesOf(tiled)).toBe(summariesOf(whole));
    expect(tiled.snapshot.hash).toBe(whole.snapshot.hash);
  });
});
