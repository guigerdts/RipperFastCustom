import { describe, expect, it } from 'vitest';
import { ISSUE_REGISTRY, isRegisteredIssueCode } from '../../../src/engines/halftone/contracts';
import {
  clampInputPixel,
  computeCanvas,
  coverageWeights,
  createLattice,
  enumerateVisibleFootprint,
  locateCell,
  polygonArea,
  roundHalfUp,
  screenFraction,
} from '../../../src/engines/halftone/geometry';

const lat = (resolution: number, lpi: number, angle: number) => {
  const r = createLattice({ resolution, lpi, angle });
  if (r.status !== 'accepted') throw new Error('expected accepted');
  return r.lattice;
};
const codes = (r: { issues: readonly { code: string }[] }) => r.issues.map((i) => i.code);
const sum = (w: readonly { weight: number }[]) => w.reduce((t, e) => t + e.weight, 0);

describe('ticket 06 probes', () => {
  it('AC1: exact pitch, measured frequency/angle, DPI-invariant physical cell', () => {
    const l = lat(1200, 175, 15);
    expect(l.pitch).toBe(1200 / 175); // never rounded
    expect(l.resolution / l.pitch).toBeCloseTo(175, 9);
    expect((Math.atan2(-l.u.y, -l.u.x) * 180) / Math.PI).toBeCloseTo(15, 9);
    expect(l.v.x).toBeCloseTo(-l.u.y, 9); // v = u rotated 90 degrees clockwise
    expect(l.v.y).toBeCloseTo(l.u.x, 9);
    const phys = [600, 1200, 2400].map((d) => lat(d, 175, 15).pitch / d);
    for (const p of phys) expect(p).toBeCloseTo(1 / 175, 12);
  });

  it('AC2: global origin/phase and tile-independent global indices', () => {
    const a = lat(1200, 150, 15);
    const b = lat(1200, 150, 15);
    expect(a.origin).toEqual({ x: 0, y: 0 });
    expect(a.phase).toEqual({ x: 0, y: 0 });
    expect(b).toEqual(a);
    expect(locateCell({ x: 37.25, y: 88.5 }, a)).toEqual(locateCell({ x: 37.25, y: 88.5 }, b));
    const axis = lat(8, 1, 0); // pitch 8, u = (-8, 0)
    expect(locateCell({ x: 100, y: 0 }, axis).i).toBe(-13); // floor(-100/8), global
  });

  it('AC3/AC4: a = -0.25 -> i = -1, alpha = 0.75, matching the positive offset', () => {
    const unit = lat(1, 1, 0);
    const neg = locateCell({ x: 0.25, y: 0 }, unit);
    const pos = locateCell({ x: -0.75, y: 0 }, unit);
    expect(neg.i).toBe(-1); // truncation would give 0
    expect(neg.alpha).toBeCloseTo(0.75, 12);
    expect(neg.alpha).toBeCloseTo(pos.alpha, 12);
    expect(pos.i - neg.i).toBe(1);
    const y = locateCell({ x: 0, y: 0.25 }, unit);
    expect(y.j).toBe(-1);
    expect(y.beta).toBeCloseTo(0.75, 12);
  });

  it('AC5: round-half-up, exact half up, zero -> empty_canvas, malformed -> invalid_input', () => {
    expect([roundHalfUp(0.5), roundHalfUp(1.5), roundHalfUp(2.5)]).toEqual([1, 2, 3]);
    expect(roundHalfUp(2.4999)).toBe(2);
    const at = computeCanvas({ inputWidth: 5, inputHeight: 5, ppi: 2, dpi: 1 });
    const below = computeCanvas({ inputWidth: 4.9998, inputHeight: 5, ppi: 2, dpi: 1 });
    if (at.status !== 'accepted' || below.status !== 'accepted') throw new Error('accepted');
    expect(below.canvas.width).toBe(2);
    expect(at.canvas.width).toBe(3); // exact half rounds up
    const empty = computeCanvas({ inputWidth: 1, inputHeight: 1, ppi: 1000, dpi: 100 });
    expect(codes(empty)).toContain('geometry.empty_canvas');
    expect(codes(empty)).not.toContain('geometry.invalid_input');
    for (const bad of [
      computeCanvas({ inputWidth: -1, inputHeight: 4, ppi: 72, dpi: 300 }),
      computeCanvas({ inputWidth: 4, inputHeight: 4, ppi: 0, dpi: 300 }),
      computeCanvas({ inputWidth: 4, inputHeight: 4, ppi: 72, dpi: -1 }),
      computeCanvas({ inputWidth: 4, inputHeight: 4, ppi: Number.NaN, dpi: 300 }),
    ]) {
      expect(bad.status).toBe('rejected');
      expect(codes(bad)).toContain('geometry.invalid_input');
      expect(codes(bad)).not.toContain('geometry.empty_canvas');
    }
  });

  it('AC6: only the canvas dimension is rounded', () => {
    expect(lat(1200, 175, 15).pitch).toBe(1200 / 175);
    const c = computeCanvas({ inputWidth: 1, inputHeight: 1, ppi: 3, dpi: 1000 });
    if (c.status !== 'accepted') throw new Error('accepted');
    expect(c.canvas.physicalWidth).toBe(1 / 3); // unrounded
    expect(c.canvas.width).toBe(333); // the single rounding step
  });

  it('AC7: floor-then-clamp and weights summing past every input side', () => {
    expect(clampInputPixel(-0.2, 0.5, 10, 10)).toEqual({ k: 0, l: 0 });
    expect(clampInputPixel(10.5, -0.5, 10, 10)).toEqual({ k: 9, l: 0 });
    const big = [
      { x: -2, y: -2 },
      { x: 3, y: -2 },
      { x: 3, y: 3 },
      { x: -2, y: 3 },
    ];
    const w = coverageWeights({ polygon: big, width: 2, height: 2 });
    expect(sum(w)).toBeCloseTo(polygonArea(big), 9); // 25, no area dropped
    for (const e of w) {
      expect(e.k).toBeGreaterThanOrEqual(0);
      expect(e.k).toBeLessThanOrEqual(1);
      expect(e.l).toBeGreaterThanOrEqual(0);
      expect(e.l).toBeLessThanOrEqual(1);
    }
  });

  it('AC8: clipped footprint, marked/visible, zero visible -> null (no trace entry)', () => {
    const fp = (pts: readonly [number, number][]) => ({
      i: 0,
      j: 0,
      corners: pts.map(([x, y]) => ({ x, y })) as [
        { x: number; y: number },
        { x: number; y: number },
        { x: number; y: number },
        { x: number; y: number },
      ],
    });
    const clipped = enumerateVisibleFootprint(
      fp([
        [3, 0],
        [6, 0],
        [6, 2],
        [3, 2],
      ]),
      {
        width: 4,
        height: 4,
      },
    );
    expect(clipped.clipped).toBe(true);
    expect(clipped.visible).toBe(2);
    expect(screenFraction(1, clipped.visible)).toBe(0.5);
    const outside = enumerateVisibleFootprint(
      fp([
        [9, 9],
        [11, 9],
        [11, 11],
        [9, 11],
      ]),
      {
        width: 4,
        height: 4,
      },
    );
    expect(outside.visible).toBe(0);
    expect(screenFraction(3, outside.visible)).toBeNull();
    expect(screenFraction(0, 2.5)).toBeNull();
  });

  it('AC9: every emitted geometry issue is registered as an error in scope geometry', () => {
    const results = [
      createLattice({ resolution: 0, lpi: 150, angle: 0 }),
      createLattice({ resolution: 1200, lpi: 150, angle: Number.NaN }),
      computeCanvas({ inputWidth: 1, inputHeight: 1, ppi: 1000, dpi: 100 }),
      computeCanvas({ inputWidth: -1, inputHeight: 4, ppi: 72, dpi: 300 }),
    ];
    for (const r of results.flatMap((x) => x.issues)) {
      expect(isRegisteredIssueCode(r.code)).toBe(true);
      expect(ISSUE_REGISTRY[r.code as keyof typeof ISSUE_REGISTRY]).toEqual({
        severity: 'error',
        scope: 'geometry',
      });
    }
  });
});
