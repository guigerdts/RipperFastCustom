import { describe, expect, it } from 'vitest';
import {
  ISSUE_REGISTRY,
  createIssue,
  isRegisteredIssueCode,
  type CanvasDimensions,
  type CanvasResult,
  type CellFootprint,
  type CoverageWeight,
  type Lattice,
  type LatticeResult,
  type Vector2,
} from '../../../src/engines/halftone/contracts';
import {
  cellFootprint,
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

function latticeOf(result: LatticeResult): Lattice {
  if (result.status !== 'accepted') throw new Error('expected an accepted lattice');
  return result.lattice;
}

function canvasOf(result: CanvasResult): CanvasDimensions {
  if (result.status !== 'accepted') throw new Error('expected an accepted canvas');
  return result.canvas;
}

function codes(result: { readonly issues: readonly { readonly code: string }[] }): string[] {
  return result.issues.map((issue) => issue.code);
}

function measuredFrequency(lattice: Lattice): number {
  return 1 / (lattice.pitch / lattice.resolution);
}

function measuredAngle(lattice: Lattice): number {
  return (Math.atan2(-lattice.u.y, -lattice.u.x) * 180) / Math.PI;
}

function sumWeights(weights: readonly CoverageWeight[]): number {
  return weights.reduce((total, entry) => total + entry.weight, 0);
}

function footprintOf(corners: readonly [Vector2, Vector2, Vector2, Vector2]): CellFootprint {
  return { i: 0, j: 0, corners };
}

describe('lattice: frequency, angle and basis', () => {
  it('builds a basis of the nominal pitch at angle 0', () => {
    const lattice = latticeOf(createLattice({ resolution: 1200, lpi: 150, angle: 0 }));

    expect(lattice.pitch).toBeCloseTo(8, 12);
    expect(lattice.u).toEqual({ x: -8, y: 0 });
    expect(lattice.v).toEqual({ x: 0, y: -8 });
  });

  it('keeps the physical cell size constant when output DPI changes', () => {
    const low = latticeOf(createLattice({ resolution: 1200, lpi: 150, angle: 0 }));
    const high = latticeOf(createLattice({ resolution: 2400, lpi: 150, angle: 0 }));

    expect(low.pitch / low.resolution).toBeCloseTo(1 / 150, 12);
    expect(high.pitch / high.resolution).toBeCloseTo(1 / 150, 12);
  });

  it('measures the requested frequency for a fractional DPI/LPI ratio', () => {
    const lattice = latticeOf(createLattice({ resolution: 1200, lpi: 175, angle: 0 }));

    expect(lattice.pitch).not.toBe(Math.round(lattice.pitch));
    expect(measuredFrequency(lattice)).toBeCloseTo(175, 9);
  });

  it('measures the requested angle from 9 o’clock, clockwise', () => {
    for (const angle of [0, 30, 45, 90, 135]) {
      const lattice = latticeOf(createLattice({ resolution: 1200, lpi: 150, angle }));
      expect(measuredAngle(lattice)).toBeCloseTo(angle, 9);
    }
  });

  it('produces orthogonal basis vectors of equal length', () => {
    const lattice = latticeOf(createLattice({ resolution: 900, lpi: 120, angle: 22.5 }));
    const dot = lattice.u.x * lattice.v.x + lattice.u.y * lattice.v.y;
    const uLength = Math.hypot(lattice.u.x, lattice.u.y);
    const vLength = Math.hypot(lattice.v.x, lattice.v.y);

    expect(dot).toBeCloseTo(0, 9);
    expect(uLength).toBeCloseTo(lattice.pitch, 9);
    expect(vLength).toBeCloseTo(lattice.pitch, 9);
  });

  it('anchors the lattice globally at the canvas origin with phase 0', () => {
    const first = latticeOf(createLattice({ resolution: 1200, lpi: 150, angle: 15 }));
    const second = latticeOf(createLattice({ resolution: 1200, lpi: 150, angle: 15 }));

    expect(first.origin).toEqual({ x: 0, y: 0 });
    expect(first.phase).toEqual({ x: 0, y: 0 });
    expect(second).toEqual(first);
  });

  it('reuses one global lattice across tiles without re-anchoring', () => {
    const profile = { resolution: 1200, lpi: 150, angle: 15 } as const;
    const fullCanvas = latticeOf(createLattice(profile));
    const firstTile = latticeOf(createLattice(profile));
    const secondTile = latticeOf(createLattice(profile));

    expect(firstTile.origin).toEqual({ x: 0, y: 0 });
    expect(firstTile.phase).toEqual({ x: 0, y: 0 });
    expect(firstTile).toEqual(fullCanvas);
    expect(secondTile).toEqual(fullCanvas);

    // A tile never rebases a point to its own origin: global coordinates land
    // in the same cell whichever tile renders them.
    const globalPoint = { x: 37.25, y: 88.5 };
    expect(locateCell(globalPoint, secondTile)).toEqual(locateCell(globalPoint, firstTile));
  });

  it('rejects non-positive resolution or LPI and a non-finite angle', () => {
    const zeroResolution = createLattice({ resolution: 0, lpi: 150, angle: 0 });
    const negativeLpi = createLattice({ resolution: 1200, lpi: -1, angle: 0 });
    const infiniteAngle = createLattice({ resolution: 1200, lpi: 150, angle: Number.NaN });

    expect(zeroResolution.status).toBe('rejected');
    expect(negativeLpi.status).toBe('rejected');
    expect(infiniteAngle.status).toBe('rejected');
    expect(codes(zeroResolution)).toContain('geometry.invalid_input');
  });
});

describe('cell indexing with floor', () => {
  const unit = (): Lattice => latticeOf(createLattice({ resolution: 1, lpi: 1, angle: 0 }));

  it('uses floor, not truncation, for a negative inverse coordinate', () => {
    const address = locateCell({ x: 0.25, y: 0 }, unit());

    expect(address.i).toBe(-1);
    expect(address.alpha).toBeCloseTo(0.75, 12);
  });

  it('maps the same fractional position from a negative and a positive offset', () => {
    const negative = locateCell({ x: 0.25, y: 0 }, unit()); // a = -0.25
    const positive = locateCell({ x: -0.75, y: 0 }, unit()); // a = 0.75

    expect(negative.alpha).toBeCloseTo(positive.alpha, 12);
    expect(positive.i - negative.i).toBe(1);
  });

  it('keeps alpha and beta in [0, 1) across negative coordinates', () => {
    const lattice = latticeOf(createLattice({ resolution: 100, lpi: 40, angle: 30 }));
    const points: readonly Vector2[] = [
      { x: 0, y: 0 },
      { x: -37.5, y: 12.25 },
      { x: 123.75, y: -88.5 },
      { x: -0.001, y: -0.001 },
    ];
    for (const point of points) {
      const address = locateCell(point, lattice);
      expect(address.alpha).toBeGreaterThanOrEqual(0);
      expect(address.alpha).toBeLessThan(1);
      expect(address.beta).toBeGreaterThanOrEqual(0);
      expect(address.beta).toBeLessThan(1);
      expect(Number.isInteger(address.i)).toBe(true);
      expect(Number.isInteger(address.j)).toBe(true);
    }
  });

  it('is periodic: shifting by u increments i and preserves alpha', () => {
    const lattice = unit();
    const point = { x: 0.25, y: 0.1 };
    const base = locateCell(point, lattice);
    const shifted = locateCell({ x: point.x + lattice.u.x, y: point.y + lattice.u.y }, lattice);

    expect(shifted.i).toBe(base.i + 1);
    expect(shifted.alpha).toBeCloseTo(base.alpha, 12);
    expect(shifted.beta).toBeCloseTo(base.beta, 12);
  });

  it('locates the centre of a cell from its footprint', () => {
    const lattice = latticeOf(createLattice({ resolution: 2, lpi: 1, angle: 0 }));
    const cellCentre = {
      x: lattice.origin.x + 0.5 * lattice.u.x + 0.5 * lattice.v.x,
      y: lattice.origin.y + 0.5 * lattice.u.y + 0.5 * lattice.v.y,
    };
    const address = locateCell(cellCentre, lattice);

    expect(address.i).toBe(0);
    expect(address.j).toBe(0);
    expect(address.alpha).toBeCloseTo(0.5, 12);
    expect(address.beta).toBeCloseTo(0.5, 12);
  });
});

describe('cell footprints', () => {
  it('places corners on the declared lattice basis', () => {
    const lattice = latticeOf(createLattice({ resolution: 2, lpi: 1, angle: 0 }));
    const footprint = cellFootprint(0, 0, lattice);

    expect(footprint.corners).toEqual([
      { x: 0, y: 0 },
      { x: -2, y: 0 },
      { x: -2, y: -2 },
      { x: 0, y: -2 },
    ]);
  });

  it('tiles adjacent cells by the basis vector', () => {
    const lattice = latticeOf(createLattice({ resolution: 2, lpi: 1, angle: 0 }));
    const base = cellFootprint(0, 0, lattice);
    const next = cellFootprint(1, 0, lattice);

    next.corners.forEach((corner, index) => {
      const baseCorner = base.corners[index];
      if (baseCorner === undefined) throw new Error('missing base corner');
      expect(corner.x).toBeCloseTo(baseCorner.x + lattice.u.x, 12);
      expect(corner.y).toBeCloseTo(baseCorner.y + lattice.u.y, 12);
    });
  });
});

describe('canvas dimensions', () => {
  it('rounds half up', () => {
    expect(roundHalfUp(0.4999)).toBe(0);
    expect(roundHalfUp(0.5)).toBe(1);
    expect(roundHalfUp(1.4999)).toBe(1);
    expect(roundHalfUp(1.5)).toBe(2);
    expect(roundHalfUp(2.5001)).toBe(3);
    expect(roundHalfUp(2.5)).toBe(3);
  });

  it('computes fractional dimensions with floor(x + 0.5)', () => {
    const canvas = canvasOf(computeCanvas({ inputWidth: 1, inputHeight: 1, ppi: 2, dpi: 5 }));

    expect(canvas.physicalWidth).toBeCloseTo(0.5, 12);
    expect(canvas.width).toBe(3);
    expect(canvas.height).toBe(3);
  });

  it('rounds an exact half up', () => {
    const canvas = canvasOf(
      computeCanvas({ inputWidth: 100, inputHeight: 100, ppi: 100, dpi: 0.5 }),
    );

    expect(canvas.physicalWidth).toBeCloseTo(1, 12);
    expect(canvas.width).toBe(1);
    expect(canvas.height).toBe(1);
  });

  it('rounds just below, at and just above an exact half', () => {
    const below = canvasOf(
      computeCanvas({ inputWidth: 4.9998, inputHeight: 4.9998, ppi: 2, dpi: 1 }),
    );
    const at = canvasOf(computeCanvas({ inputWidth: 5, inputHeight: 5, ppi: 2, dpi: 1 }));
    const above = canvasOf(
      computeCanvas({ inputWidth: 5.0002, inputHeight: 5.0002, ppi: 2, dpi: 1 }),
    );

    expect(below.width).toBe(2); // 2.4999
    expect(at.width).toBe(3); // 2.5
    expect(above.width).toBe(3); // 2.5001
  });

  it('pins a non-integer ratio', () => {
    const canvas = canvasOf(computeCanvas({ inputWidth: 1, inputHeight: 1, ppi: 3, dpi: 1000 }));

    expect(canvas.width).toBe(333);
    expect(canvas.height).toBe(333);
  });

  it('rejects a zero computed dimension as geometry.empty_canvas', () => {
    const result = computeCanvas({ inputWidth: 1, inputHeight: 1, ppi: 1000, dpi: 100 });

    expect(result.status).toBe('rejected');
    expect(codes(result)).toContain('geometry.empty_canvas');
  });

  it('records the rounding rule and supplied values', () => {
    const canvas = canvasOf(computeCanvas({ inputWidth: 1, inputHeight: 1, ppi: 2, dpi: 5 }));

    expect(canvas.roundingRule).toBe('floor(x+0.5)');
    expect(canvas.dpi).toBe(5);
    expect(canvas.ppi).toBe(2);
  });

  it('rejects malformed canvas inputs as geometry.invalid_input', () => {
    const cases: readonly CanvasResult[] = [
      computeCanvas({ inputWidth: -1, inputHeight: 1, ppi: 2, dpi: 5 }),
      computeCanvas({ inputWidth: 1, inputHeight: 1, ppi: 0, dpi: 5 }),
      computeCanvas({ inputWidth: 1, inputHeight: 1, ppi: Number.NaN, dpi: 5 }),
      computeCanvas({ inputWidth: 1, inputHeight: 1, ppi: 2, dpi: -1 }),
      computeCanvas(null as unknown as Parameters<typeof computeCanvas>[0]),
    ];

    for (const result of cases) {
      expect(result.status).toBe('rejected');
      expect(codes(result)).toContain('geometry.invalid_input');
    }
  });

  it('rejects a zero input dimension as geometry.empty_canvas', () => {
    const result = computeCanvas({ inputWidth: 0, inputHeight: 10, ppi: 100, dpi: 100 });

    expect(result.status).toBe('rejected');
    expect(codes(result)).toContain('geometry.empty_canvas');
    expect(codes(result)).not.toContain('geometry.invalid_input');
  });
});

describe('edge clamp', () => {
  it('clamps out-of-range coordinates to the border pixel', () => {
    expect(clampInputPixel(-0.2, 0.5, 10, 10)).toEqual({ k: 0, l: 0 });
    expect(clampInputPixel(9.5, 10.2, 10, 10)).toEqual({ k: 9, l: 9 });
    expect(clampInputPixel(5.7, 3.2, 10, 10)).toEqual({ k: 5, l: 3 });
  });

  it('accumulates coverage weights on the clamped border pixel', () => {
    const weights = coverageWeights({
      polygon: [
        { x: -1, y: 0 },
        { x: 0.5, y: 0 },
        { x: 0.5, y: 1 },
        { x: -1, y: 1 },
      ],
      width: 4,
      height: 4,
    });

    expect(weights).toHaveLength(1);
    expect(weights[0]?.k).toBe(0);
    expect(weights[0]?.l).toBe(0);
    expect(weights[0]?.weight).toBeCloseTo(1.5, 9);
  });
});

describe('area-coverage weights', () => {
  it('attributes a fully inside unit square to one pixel', () => {
    const weights = coverageWeights({
      polygon: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ],
      width: 4,
      height: 4,
    });

    expect(weights).toHaveLength(1);
    expect(weights[0]?.pixel).toBe(0);
    expect(weights[0]?.weight).toBeCloseTo(1, 12);
  });

  it('sums to the footprint area when crossing each input side', () => {
    const cases: readonly { readonly polygon: readonly Vector2[]; readonly expected: Vector2 }[] = [
      {
        polygon: [
          { x: -1, y: 0 },
          { x: 0.5, y: 0 },
          { x: 0.5, y: 1 },
          { x: -1, y: 1 },
        ],
        expected: { x: 0, y: 0 },
      },
      {
        polygon: [
          { x: 3.5, y: 0 },
          { x: 5, y: 0 },
          { x: 5, y: 1 },
          { x: 3.5, y: 1 },
        ],
        expected: { x: 3, y: 0 },
      },
      {
        polygon: [
          { x: 0, y: -1 },
          { x: 1, y: -1 },
          { x: 1, y: 0.5 },
          { x: 0, y: 0.5 },
        ],
        expected: { x: 0, y: 0 },
      },
      {
        polygon: [
          { x: 0, y: 3.5 },
          { x: 1, y: 3.5 },
          { x: 1, y: 5 },
          { x: 0, y: 5 },
        ],
        expected: { x: 0, y: 3 },
      },
    ];

    for (const { polygon, expected } of cases) {
      const weights = coverageWeights({ polygon, width: 4, height: 4 });
      expect(sumWeights(weights)).toBeCloseTo(polygonArea(polygon), 9);
      expect(weights).toHaveLength(1);
      expect(weights[0]?.k).toBe(expected.x);
      expect(weights[0]?.l).toBe(expected.y);
    }
  });

  it('sums to the footprint area for a rotated footprint crossing the corner', () => {
    const polygon: readonly Vector2[] = [
      { x: -1, y: 0 },
      { x: 0, y: -1 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ];
    const weights = coverageWeights({ polygon, width: 4, height: 4 });

    expect(sumWeights(weights)).toBeCloseTo(2, 9);
    expect(weights).toHaveLength(1);
    expect(weights[0]?.pixel).toBe(0);
  });

  it('attributes a footprint entirely outside the input to the corner pixel', () => {
    const polygon: readonly Vector2[] = [
      { x: -3, y: -3 },
      { x: -2, y: -3 },
      { x: -2, y: -2 },
      { x: -3, y: -2 },
    ];
    const weights = coverageWeights({ polygon, width: 4, height: 4 });

    expect(sumWeights(weights)).toBeCloseTo(1, 9);
    expect(weights).toHaveLength(1);
    expect(weights[0]?.k).toBe(0);
    expect(weights[0]?.l).toBe(0);
  });
});

describe('clipped footprint semantics', () => {
  const canvas = { width: 4, height: 4 };

  it('reports an unclipped cell with its full visible pixel count', () => {
    const footprint = footprintOf([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ]);
    const visible = enumerateVisibleFootprint(footprint, canvas);

    expect(visible.clipped).toBe(false);
    expect(visible.visible).toBe(4);
    expect(visible.pixels).toHaveLength(4);
  });

  it('reports a clipped cell over the canvas-visible footprint', () => {
    const footprint = footprintOf([
      { x: 3, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 2 },
      { x: 3, y: 2 },
    ]);
    const visible = enumerateVisibleFootprint(footprint, canvas);

    expect(visible.clipped).toBe(true);
    expect(visible.visible).toBe(2);
    expect(visible.pixels).toEqual([
      { k: 3, l: 0 },
      { k: 3, l: 1 },
    ]);
  });

  it('reports zero visible for a cell entirely outside the canvas', () => {
    const footprint = footprintOf([
      { x: 10, y: 10 },
      { x: 12, y: 10 },
      { x: 12, y: 12 },
      { x: 10, y: 12 },
    ]);
    const visible = enumerateVisibleFootprint(footprint, canvas);

    expect(visible.clipped).toBe(true);
    expect(visible.visible).toBe(0);
    expect(visible.pixels).toHaveLength(0);
  });

  it('enumerates a rotated footprint deterministically', () => {
    const footprint = footprintOf([
      { x: 2.5, y: 1 },
      { x: 4, y: 2.5 },
      { x: 2.5, y: 4 },
      { x: 1, y: 2.5 },
    ]);
    const visible = enumerateVisibleFootprint(footprint, { width: 5, height: 5 });
    const sorted = [...visible.pixels].map((pixel) => `${pixel.k},${pixel.l}`).sort();

    expect(visible.clipped).toBe(false);
    expect(visible.visible).toBe(5);
    expect(sorted).toEqual(['1,2', '2,1', '2,2', '2,3', '3,2']);
  });

  it('returns a null fraction for a zero-visible footprint and marked/visible otherwise', () => {
    expect(screenFraction(2, 4)).toBe(0.5);
    expect(screenFraction(0, 3)).toBe(0);
    expect(screenFraction(4, 4)).toBe(1);
    expect(screenFraction(0, 0)).toBeNull();
    expect(screenFraction(0, -1)).toBeNull();
    expect(screenFraction(0, 1.5)).toBeNull();
    expect(screenFraction(Number.NaN, 4)).toBeNull();
  });

  it('reports marked/visible over the canvas-clipped footprint', () => {
    const footprint = footprintOf([
      { x: 3, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 2 },
      { x: 3, y: 2 },
    ]);
    const visible = enumerateVisibleFootprint(footprint, canvas);
    const fraction = screenFraction(1, visible.visible);

    expect(visible.visible).toBe(2);
    expect(fraction).toBe(0.5);
  });
});

describe('geometry issue registration', () => {
  it('registers geometry.empty_canvas as an error in the geometry scope', () => {
    expect(isRegisteredIssueCode('geometry.empty_canvas')).toBe(true);
    expect(ISSUE_REGISTRY['geometry.empty_canvas']).toEqual({
      severity: 'error',
      scope: 'geometry',
    });
    const issue = createIssue('geometry.empty_canvas', 'zero canvas');
    expect(issue.scope).toBe('geometry');
    expect(issue.severity).toBe('error');
  });

  it('registers geometry.invalid_input as an error in the geometry scope', () => {
    expect(isRegisteredIssueCode('geometry.invalid_input')).toBe(true);
    expect(ISSUE_REGISTRY['geometry.invalid_input']).toEqual({
      severity: 'error',
      scope: 'geometry',
    });
  });

  it('emits only registered geometry-scope codes', () => {
    const results = [
      createLattice({ resolution: 0, lpi: 0, angle: Number.NaN }),
      computeCanvas({ inputWidth: 0, inputHeight: 0, ppi: 0, dpi: 0 }),
      computeCanvas({ inputWidth: 1, inputHeight: 1, ppi: 1000, dpi: 100 }),
    ];

    const issues = results.flatMap((result) => result.issues);
    expect(issues.length).toBeGreaterThan(0);
    for (const issue of issues) {
      expect(isRegisteredIssueCode(issue.code)).toBe(true);
      expect(issue.scope).toBe('geometry');
    }
  });
});
