// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { acceptForProduction } from '../../src/engines/halftone/contracts';
import {
  codes,
  countingToken,
  flatInput,
  grayProfile,
  rampInput,
  rasterDigest,
  rgbInput,
  rgbProfile,
  run,
} from './fixtures';

/**
 * The three public outcomes, driven only by the single screening seam.
 *
 * The shape assertions are the contract: a completed run owns rasters,
 * per-channel metadata and a snapshot; a rejected run owns diagnostics only; a
 * cancelled run owns diagnostics only. No partial raster or snapshot may leak
 * out of a non-completed outcome.
 */

const rejections = [
  { label: 'missing PPI', input: flatInput(128, 8, { ppi: undefined as never }) },
  { label: 'unsupported layout', input: flatInput(128, 8, { layout: 'lab' as never }) },
  { label: 'prepared artwork', input: flatInput(128, 8, { layout: 'cmyk' as never }) },
];

describe('public seam outcome shape', () => {
  it('completes with rasters, per-channel metadata and a sealed snapshot', () => {
    const result = run({ input: rampInput(), profile: grayProfile() });

    expect(result.status).toBe('completed');
    if (result.status !== 'completed') return;

    expect(result.rasters).toHaveLength(1);
    expect(result.channels).toHaveLength(1);
    expect(result.channelOrder).toEqual(result.rasters.map((raster) => raster.channelId));

    const [raster] = result.rasters;
    expect(raster?.width).toBe(result.snapshot.canvas.width);
    expect(raster?.height).toBe(result.snapshot.canvas.height);
    expect(raster?.bitsPerPixel).toBe(1);
    expect(new Set(raster?.data ?? [])).toEqual(new Set([0, 1]));

    expect(result.snapshot.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.isFrozen(result.snapshot)).toBe(true);
    expect(result.issues.every((issue) => issue.severity !== 'error')).toBe(true);
  });

  it('rejects with structured diagnostics and nothing else', () => {
    const result = run({ input: flatInput(128, 8, { ppi: 0 }) });

    expect(result.status).toBe('rejected');
    expect(Object.keys(result).sort()).toEqual(['issues', 'status']);
    expect(result).not.toHaveProperty('rasters');
    expect(result).not.toHaveProperty('snapshot');
    expect(codes(result)).toEqual(['input.invalid_ppi']);
    expect(result.issues[0]?.severity).toBe('error');
    expect(result.issues[0]?.scope).toBe('input');
    expect(result.issues[0]?.context.expected).toBeTruthy();
  });

  it('cancels with diagnostics and neither rasters nor a snapshot', () => {
    const token = countingToken(1);
    const result = run({ input: rampInput(), isCancelled: token.token });

    expect(result.status).toBe('cancelled');
    expect(Object.keys(result).sort()).toEqual(['issues', 'status']);
    expect(result).not.toHaveProperty('rasters');
    expect(result).not.toHaveProperty('snapshot');
    expect(token.calls()).toBe(1);
  });

  it('never leaks a raster or snapshot on any rejection cause', () => {
    for (const rejection of rejections) {
      const result = run({ input: rejection.input });
      expect(result.status, rejection.label).toBe('rejected');
      expect(Object.keys(result).sort(), rejection.label).toEqual(['issues', 'status']);
      expect(codes(result).length, rejection.label).toBeGreaterThan(0);
    }
  });

  it('cancels at the declared entry and per-row cadence', () => {
    const oneChannel = countingToken(null);
    const one = run({ input: rampInput(), isCancelled: oneChannel.token });
    expect(one.status).toBe('completed');
    expect(oneChannel.calls()).toBe(8);

    const threeChannels = countingToken(null);
    const three = run({
      input: rgbInput(),
      profile: rgbProfile(),
      isCancelled: threeChannels.token,
    });
    expect(three.status).toBe('completed');
    expect(threeChannels.calls()).toBe(8 * 3);

    const interrupted = countingToken(5);
    const cancelled = run({
      input: rgbInput(),
      profile: rgbProfile(),
      isCancelled: interrupted.token,
    });
    expect(cancelled.status).toBe('cancelled');
    expect(interrupted.calls()).toBe(5);
  });

  it('leaves no global state behind a cancelled run', () => {
    const reference = run({ input: rampInput(), profile: grayProfile() });
    const cancelled = run({
      input: rampInput(),
      profile: grayProfile(),
      isCancelled: countingToken(3).token,
    });
    const after = run({ input: rampInput(), profile: grayProfile() });

    expect(cancelled.status).toBe('cancelled');
    expect(reference.status).toBe('completed');
    expect(after.status).toBe('completed');
    if (reference.status !== 'completed' || after.status !== 'completed') return;
    expect(rasterDigest(after)).toBe(rasterDigest(reference));
    expect(after.snapshot.hash).toBe(reference.snapshot.hash);
  });

  it('flags a preview, halves the allocated canvas and refuses it as production output', () => {
    const production = run({ input: rampInput(), profile: grayProfile() });
    const preview = run({
      input: rampInput(),
      profile: grayProfile(),
      preview: { mode: 'divisor', divisor: 2 },
    });

    expect(production.status).toBe('completed');
    expect(preview.status).toBe('completed');
    if (production.status !== 'completed' || preview.status !== 'completed') return;

    expect(preview.snapshot.preview).toEqual({ enabled: true, resolution: 50 });
    expect(preview.snapshot.canvas.width).toBe(4);
    expect(preview.rasters[0]?.width).toBe(4);
    expect(production.rasters[0]?.width).toBe(8);
    expect(codes(preview)).toContain('preview.requested');

    expect(acceptForProduction(production).accepted).toBe(true);
    const refused = acceptForProduction(preview);
    expect(refused.accepted).toBe(false);
    expect(refused.issues.map((issue) => issue.code)).toContain('output.preview_not_accepted');
  });
});
