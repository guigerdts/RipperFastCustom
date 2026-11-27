// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  codes,
  flatInput,
  grayProfile,
  rampInput,
  rgbInput,
  rgbProfile,
  run,
  toneChannel,
} from './fixtures';

/**
 * Acceptance matrix, part 2b: screening geometry, sampling, addressability and
 * the declared warnings (spec criteria 9-14). Every case drives the single
 * public seam; the structural proofs for the lattice and the clipped footprints
 * live in `tests/unit/halftone/geometry-probes.test.ts`.
 */

const ONE_STEP = 1 / 0xffff;

function channel(overrides: Parameters<typeof toneChannel>[0] = {}) {
  return { ...toneChannel(), ...overrides };
}

describe('spec AC9: fractional lattice and DPI invariance', () => {
  it('keeps measured frequency and angle within the declared tolerance', () => {
    const result = run({
      input: rampInput(),
      profile: grayProfile({
        channels: [
          channel({ screening: { method: 'am', frequency: 175, angle: 15, dotShape: 'square' } }),
        ],
      }),
    });
    expect(result.status).toBe('completed');
    if (result.status !== 'completed') return;

    const lattice = result.snapshot.lattice;
    expect(lattice.pitch).toBeCloseTo(100 / 175, 12);
    expect(lattice.angle).toBe(15);
    expect(Math.abs(lattice.resolution / lattice.pitch - 175) / 175).toBeLessThanOrEqual(1e-12);
  });

  it('keeps the cell physical size independent of output DPI', () => {
    const physical = [100, 200, 300].map((dpi) => {
      const result = run({ input: rampInput(), dpi });
      expect(result.status).toBe('completed');
      if (result.status !== 'completed') throw new Error('expected a completed result');
      return result.snapshot.lattice.pitch / result.snapshot.lattice.resolution;
    });
    for (const size of physical)
      expect(Math.abs(size - 1 / 25)).toBeLessThanOrEqual(Number.EPSILON);
  });

  it('records a global origin, phase and orthogonal basis', () => {
    const result = run({ input: rampInput() });
    expect(result.status).toBe('completed');
    if (result.status !== 'completed') return;

    const lattice = result.snapshot.lattice;
    expect(lattice.origin).toEqual({ x: 0, y: 0 });
    expect(lattice.phase).toEqual({ x: 0, y: 0 });
    const { u, v } = lattice.basis;
    expect(Math.hypot(u.x, u.y)).toBeCloseTo(lattice.pitch, 12);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(lattice.pitch, 12);
    expect(Math.abs(u.x * v.x + u.y * v.y)).toBeLessThanOrEqual(1e-12);
  });
});

describe('spec AC10: canvas rounding and empty canvas', () => {
  it('rounds only the canvas dimension as floor(x + 0.5)', () => {
    const cases: ReadonlyArray<{
      readonly size: number;
      readonly dpi: number;
      readonly width: number;
    }> = [
      { size: 5, dpi: 50, width: 3 },
      { size: 3, dpi: 50, width: 2 },
      { size: 7, dpi: 40, width: 3 },
    ];
    for (const testCase of cases) {
      const result = run({ input: { ...rampInput(testCase.size), ppi: 100 }, dpi: testCase.dpi });
      expect(result.status, `${String(testCase.size)}@${String(testCase.dpi)}`).toBe('completed');
      if (result.status !== 'completed') continue;
      expect(result.snapshot.canvas.width).toBe(testCase.width);
      expect(result.snapshot.canvas.roundingRule).toBe('floor(x+0.5)');
      expect(result.snapshot.canvas.suppliedPpi).toBe(100);
      expect(result.snapshot.canvas.suppliedDpi).toBe(testCase.dpi);
      expect(result.rasters[0]?.width).toBe(testCase.width);
    }
  });

  it('does not round intermediate geometry to an integer', () => {
    const result = run({
      input: rampInput(),
      profile: grayProfile({
        channels: [
          channel({ screening: { method: 'am', frequency: 175, angle: 15, dotShape: 'round' } }),
        ],
      }),
    });
    expect(result.status).toBe('completed');
    if (result.status !== 'completed') return;
    expect(Number.isInteger(result.snapshot.lattice.pitch)).toBe(false);
  });

  it('rejects a zero canvas as geometry.empty_canvas', () => {
    const result = run({ input: { ...rampInput(1), ppi: 100 }, dpi: 1 });
    expect(result.status).toBe('rejected');
    expect(codes(result)).toEqual(['geometry.empty_canvas']);
  });
});

describe('spec AC11: sampling on flat and two-tone patches', () => {
  it('returns the patch value on a flat patch', () => {
    const result = run({ input: flatInput(128) });
    expect(result.status).toBe('completed');
    if (result.status !== 'completed') return;
    expect(result.channels[0]?.summaries.commanded.mean).toBeCloseTo(128 / 255, 12);
  });

  it('returns the area-weighted value on a two-tone patch within one step', () => {
    const data = new Uint8Array(64);
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) data[y * 8 + x] = x < 3 ? 0 : 128;
    }
    const result = run({
      input: { width: 8, height: 8, ppi: 100, bitDepth: 8, layout: 'grayscale', data },
    });
    expect(result.status).toBe('completed');
    if (result.status !== 'completed') return;

    const expected = (3 / 8) * 0 + (5 / 8) * (128 / 255);
    expect(
      Math.abs((result.channels[0]?.summaries.commanded.mean ?? 0) - expected),
    ).toBeLessThanOrEqual(ONE_STEP);
  });

  it('expands 16-bit samples deterministically', () => {
    const result = run({
      input: {
        width: 8,
        height: 8,
        ppi: 100,
        bitDepth: 16,
        layout: 'grayscale',
        data: new Uint16Array(64).fill(32768),
      },
    });
    expect(result.status).toBe('completed');
    if (result.status !== 'completed') return;
    expect(
      Math.abs((result.channels[0]?.summaries.commanded.mean ?? 0) - 32768 / 65535),
    ).toBeLessThanOrEqual(ONE_STEP);
  });
});

describe('spec AC12: monotonic dot area', () => {
  it('grows monotonically with the reproducible value at a fixed geometry', () => {
    const means = [0, 32, 64, 96, 128, 160, 192, 224, 255].map((sample) => {
      const result = run({ input: flatInput(sample) });
      expect(result.status).toBe('completed');
      if (result.status !== 'completed') throw new Error('expected a completed result');
      return result.channels[0]?.summaries.screened.mean ?? -1;
    });

    expect(means[0]).toBe(0);
    expect(means[means.length - 1]).toBe(1);
    for (let index = 1; index < means.length; index += 1) {
      expect(means[index], `sample ${String(index)}`).toBeGreaterThanOrEqual(means[index - 1] ?? 0);
    }
  });

  it('rejects an unknown dot shape', () => {
    const result = run({
      input: flatInput(128),
      profile: grayProfile({
        channels: [
          channel({
            screening: { method: 'am', frequency: 25, angle: 0, dotShape: 'hexagon' } as never,
          }),
        ],
      }),
    });
    expect(result.status).toBe('rejected');
    expect(codes(result)).toEqual(['profile.invalid_am_parameter']);
  });
});

describe('spec AC13: addressability from actual thresholding', () => {
  it('reports the producible coverage set separately from cell pixels', () => {
    const result = run({ input: flatInput(128) });
    expect(result.status).toBe('completed');
    if (result.status !== 'completed') return;

    const report = result.channels[0]?.addressability;
    expect(report).toBeDefined();
    if (report === undefined) return;

    expect(report.cellPixelCount).toBe(16);
    expect(report.addressableCoverageCount).toBe(report.coverages.length);
    expect(report.coverages[0]).toBe(0);
    expect(report.coverages[report.coverages.length - 1]).toBe(1);
    for (let index = 1; index < report.coverages.length; index += 1) {
      expect(report.coverages[index]).toBeGreaterThan(report.coverages[index - 1] ?? 0);
      expect(((report.coverages[index] ?? 0) * report.cellPixelCount) % 1).toBe(0);
    }
    // Distinct from the requested tonal value and from cell pixels.
    expect(report.addressableCoverageCount).not.toBe(report.cellPixelCount);
    expect(report.coverages).not.toContain(result.channels[0]?.summaries.commanded.mean);
    expect(report.shape).toBe('round');
  });

  it('is canvas-invariant and geometry-derived, not a physical level list', () => {
    const small = run({ input: flatInput(128, 8) });
    const large = run({ input: flatInput(128, 16) });
    const finer = run({ input: flatInput(128), dpi: 200 });

    expect(small.status).toBe('completed');
    expect(large.status).toBe('completed');
    expect(finer.status).toBe('completed');
    if (
      small.status !== 'completed' ||
      large.status !== 'completed' ||
      finer.status !== 'completed'
    ) {
      return;
    }

    expect(large.channels[0]?.addressability.coverages).toEqual(
      small.channels[0]?.addressability.coverages,
    );
    expect(finer.channels[0]?.addressability.cellPixelCount).toBe(64);
    expect(finer.channels[0]?.addressability.addressableCoverageCount).not.toBe(
      small.channels[0]?.addressability.addressableCoverageCount,
    );
  });
});

describe('spec AC14: the four declared warnings', () => {
  it('warns on insufficient output addressability', () => {
    const result = run({ input: flatInput(128), profile: grayProfile({ minimumCellPixels: 6 }) });
    expect(result.status).toBe('completed');
    expect(codes(result)).toEqual(['geometry.insufficient_addressability']);
    expect(result.issues[0]?.scope).toBe('geometry');
  });

  it('warns on a duplicate channel angle', () => {
    const result = run({
      input: rgbInput(),
      profile: rgbProfile({
        channels: [
          {
            ...rgbProfile().channels[0]!,
            screening: { method: 'am', frequency: 25, angle: 15, dotShape: 'round' },
          },
          {
            ...rgbProfile().channels[1]!,
            screening: { method: 'am', frequency: 25, angle: 15, dotShape: 'round' },
          },
          rgbProfile().channels[2]!,
        ],
      }),
    });
    expect(result.status).toBe('completed');
    expect(codes(result)).toContain('geometry.duplicate_angle');
    expect(result.issues[0]?.severity).toBe('warning');
  });

  it('warns on a declared input sampling minimum below the actual ratio', () => {
    const result = run({
      input: flatInput(128),
      profile: grayProfile({ minimumInputSamplesPerScreenLine: 8 }),
    });
    expect(result.status).toBe('completed');
    expect(codes(result)).toEqual(['input.low_resolution']);
    expect(result.issues[0]?.scope).toBe('input');
  });

  it('warns on a declared mesh without a validated relation', () => {
    const result = run({
      input: flatInput(128),
      profile: grayProfile({ processAttributes: { mesh: { meshCount: 230 } } }),
    });
    expect(result.status).toBe('completed');
    expect(codes(result)).toEqual(['profile.mesh_unvalidated']);
    expect(result.issues[0]?.severity).toBe('warning');
  });
});
