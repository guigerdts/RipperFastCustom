import { describe, expect, it } from 'vitest';

import {
  countingToken,
  makeInput,
  makeRgbInput,
  run,
  threeChannelProfile,
} from './cancellation-fixtures';

describe('cooperative cancellation', () => {
  it('does not change a completed run when the token never fires', () => {
    const plain = run({ input: makeInput(8, 8) });
    const counter = countingToken(null);
    const withToken = run({ input: makeInput(8, 8), isCancelled: counter.token });

    expect(plain.status).toBe('completed');
    expect(withToken.status).toBe('completed');
    if (plain.status !== 'completed' || withToken.status !== 'completed') return;

    expect(withToken.rasters.map((raster) => raster.data)).toEqual(
      plain.rasters.map((raster) => raster.data),
    );
    expect(withToken.snapshot.hash).toBe(plain.snapshot.hash);
    expect(withToken.issues).toEqual(plain.issues);
    // 8 output rows, one channel: the entry check plus rows 1..7.
    expect(counter.calls()).toBe(8);
  });

  it('cancels before any work when the token is already set', () => {
    const result = run({ isCancelled: () => true });

    expect(result.status).toBe('cancelled');
    expect('rasters' in result).toBe(false);
    expect('snapshot' in result).toBe(false);
    expect(result.issues).toEqual([]);
  });

  it('cancels at the first row check after the entry check', () => {
    const counter = countingToken(2);
    const result = run({ input: makeInput(8, 8), isCancelled: counter.token });

    expect(result.status).toBe('cancelled');
    expect('rasters' in result).toBe(false);
    expect(counter.calls()).toBe(2);
  });

  it('cancels in the middle of a large single-channel run', () => {
    // 96x64 input at the same PPI and DPI yields a 96x64 canvas: 64 rows.
    const counter = countingToken(32);
    const result = run({ input: makeInput(96, 64), isCancelled: counter.token });

    expect(result.status).toBe('cancelled');
    expect('rasters' in result).toBe(false);
    expect('snapshot' in result).toBe(false);
    // Each call corresponds to one distinct output row, so 32 calls prove at
    // least 32 of the 64 rows were never reached.
    expect(counter.calls()).toBe(32);
    expect(counter.calls()).toBeLessThan(64);
  });

  it('cancels at the boundary between channels', () => {
    const input = makeRgbInput(8, 8);
    const profile = threeChannelProfile();
    // Channel 1 consumes the entry check plus rows 1..7 (8 calls); the first
    // row of channel 2 is call 9.
    const counter = countingToken(9);
    const result = run({ input, profile, isCancelled: counter.token });

    expect(result.status).toBe('cancelled');
    expect('rasters' in result).toBe(false);
    expect(counter.calls()).toBe(9);
  });

  it('cancels at the last check, immediately before the snapshot is sealed', () => {
    const input = makeRgbInput(8, 8);
    const profile = threeChannelProfile();
    const rows = 8;
    const channels = 3;
    const counter = countingToken(rows * channels);
    const result = run({ input, profile, isCancelled: counter.token });

    expect(result.status).toBe('cancelled');
    expect('rasters' in result).toBe(false);
    expect('snapshot' in result).toBe(false);
    expect(counter.calls()).toBe(rows * channels);
  });

  it('checks exactly once per output row per channel, never per pixel', () => {
    const counter = countingToken(null);
    const result = run({
      input: makeRgbInput(8, 8),
      profile: threeChannelProfile(),
      isCancelled: counter.token,
    });

    expect(result.status).toBe('completed');
    if (result.status !== 'completed') return;

    const rows = result.snapshot.canvas.height;
    const channels = result.rasters.length;
    expect(rows * channels).toBe(24);
    expect(counter.calls()).toBe(rows * channels);
  });

  it('is deterministic for a fixed cancellation point', () => {
    const first = countingToken(20);
    const second = countingToken(20);
    const a = run({ input: makeInput(96, 64), isCancelled: first.token });
    const b = run({ input: makeInput(96, 64), isCancelled: second.token });

    expect(a.status).toBe('cancelled');
    expect(b.status).toBe('cancelled');
    expect(a.issues).toEqual(b.issues);
    expect(first.calls()).toBe(20);
    expect(second.calls()).toBe(20);
  });

  it('leaves no global state after a cancelled run', () => {
    const input = makeInput(32, 32);
    const baseline = run({ input });
    expect(baseline.status).toBe('completed');

    const cancelled = run({ input, isCancelled: countingToken(10).token });
    expect(cancelled.status).toBe('cancelled');

    const after = run({ input });
    expect(after.status).toBe('completed');
    if (baseline.status !== 'completed' || after.status !== 'completed') return;
    expect(after.snapshot.hash).toBe(baseline.snapshot.hash);
    expect(after.rasters.map((raster) => raster.data)).toEqual(
      baseline.rasters.map((raster) => raster.data),
    );
  });

  it('does not mutate the caller input when cancelled', () => {
    const input = makeInput(96, 64);
    const before = Array.from(input.data);
    const result = run({ input, isCancelled: countingToken(30).token });

    expect(result.status).toBe('cancelled');
    expect(Array.from(input.data)).toEqual(before);
  });
});
