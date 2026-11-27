import { describe, expect, it } from 'vitest';

import {
  countingToken,
  makeInput,
  makeRgbInput,
  run,
  threeChannelProfile,
} from './cancellation-fixtures';

describe('cooperative cancellation probes', () => {
  it('keeps the same bound when a tile mask skips most pixels', () => {
    const counter = countingToken(null);
    const result = run({
      input: makeRgbInput(8, 8),
      profile: threeChannelProfile(),
      tiles: [{ x: 0, y: 0, width: 2, height: 2 }],
      isCancelled: counter.token,
    });

    expect(result.status).toBe('completed');
    expect(counter.calls()).toBe(24);
  });

  it('cancels during a preview run at the reduced resolution', () => {
    // Divisor 2 of 64x48 at 100 DPI is a 32x24 canvas: 24 rows, not 48.
    const counter = countingToken(12);
    const result = run({
      input: makeInput(64, 48),
      preview: { mode: 'divisor', divisor: 2 },
      isCancelled: counter.token,
    });

    expect(result.status).toBe('cancelled');
    expect('rasters' in result).toBe(false);
    expect('snapshot' in result).toBe(false);
    expect(counter.calls()).toBe(12);
    expect(counter.calls()).toBeLessThan(24);
  });

  it('never labels a partially filled raster as completed', () => {
    for (const cancelAt of [2, 3, 7, 11]) {
      const counter = countingToken(cancelAt);
      const result = run({ input: makeInput(16, 16), isCancelled: counter.token });

      expect(result.status).toBe('cancelled');
      expect('rasters' in result).toBe(false);
      expect('snapshot' in result).toBe(false);
      expect(counter.calls()).toBe(cancelAt);
    }
  });

  it('keeps a token that is consulted again after a cancellation safe', () => {
    const counter = countingToken(10);
    const first = run({ input: makeInput(32, 32), isCancelled: counter.token });
    expect(first.status).toBe('cancelled');
    expect(counter.calls()).toBe(10);

    // The same token now answers `true` on its next consultation; the engine
    // must not throw or expose a partial result.
    const second = run({ input: makeInput(32, 32), isCancelled: counter.token });
    expect(second.status).toBe('cancelled');
    expect('rasters' in second).toBe(false);
    expect('snapshot' in second).toBe(false);
  });

  it('keeps whole-image and tiled rasters byte-identical with a live token', () => {
    const input = makeInput(8, 8);
    const whole = run({ input, isCancelled: countingToken(null).token });
    const tiled = run({
      input,
      tiles: [{ x: 0, y: 0, width: 8, height: 8 }],
      isCancelled: countingToken(null).token,
    });

    expect(whole.status).toBe('completed');
    expect(tiled.status).toBe('completed');
    if (whole.status !== 'completed' || tiled.status !== 'completed') return;
    expect(tiled.rasters[0]?.data).toEqual(whole.rasters[0]?.data);
  });
});
