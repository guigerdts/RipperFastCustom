# 06: AM geometry: global lattice, angle, sub-pixel placement and boundaries

Type: task
Status: ready-for-agent
Feature: halftone-engine
Spec ticket: 5 of 12
Spec: ../spec.md

**What to build:** The AM geometry contract. The cell's physical side is `1 / LPI` inch and its
nominal pixel pitch is `output DPI / LPI`, possibly fractional. The lattice is global, anchored at
the canvas origin with phase 0, and its basis vectors have length `output DPI / LPI` output pixels.
Angles come from the profile, measured from 9 o'clock clockwise. Cell indices use floor on
inverse-basis coordinates, so negative coordinates work without truncation. The canvas dimension uses
one declared round-half-up rule and rejects a zero result. Edge-clamp and `clipped` semantics are
defined exactly.

**Blocked by:** 02 (shared contracts).

**Issue contract:** Emits only issues registered by the shared contract in 02; no module-local code
is introduced.

**Execution note:** May run in parallel with the other tickets blocked only by 02 when edit surfaces
are disjoint; otherwise sequential.

**Scope:**

- Global lattice origin, phase, `u`/`v` basis and angular convention.
- Floor-based cell indexing, including negative coordinates.
- Canvas dimensions with `round-half-up(x) = floor(x + 0.5)` and `geometry.empty_canvas`.
- Edge-clamp input extension and `clipped: true` trace semantics.
- Tile and block consistency basis: no re-anchoring or phase shift.

**Out of scope:** sampling values, thresholding, dot shapes, addressability enumeration and
rasterization.

**Acceptance criteria:**

- [ ] For a non-integer `output DPI / LPI` ratio, the measured frequency and angle stay within the
      declared tolerance, and changing output DPI does not change the cell's physical size.
- [ ] The lattice origin, phase and basis are the declared global ones; a tile boundary never
      re-anchors or shifts the lattice.
- [ ] Cell indexing uses `floor` on inverse-basis coordinates, so negative coordinates yield negative
      indices with `alpha` and `beta` in `[0, 1)`; truncation toward zero is absent.
- [ ] A cell reached from a negative coordinate matches the same cell reached from a positive
      offset.
- [ ] The canvas dimension is `floor(x + 0.5)` on non-negative values; exact halves round up; a
      computed dimension of zero is rejected as `geometry.empty_canvas`.
- [ ] No intermediate geometry value is rounded to an integer; only the canvas dimension is rounded.
- [ ] Edge-clamp replicates border pixels, and coverage weights sum to the cell area for footprints
      extending beyond any input side.
- [ ] A clipped cell reports `clipped: true` with `marked / visible` over the canvas-clipped
      footprint; a cell with zero visible pixels is not evaluated.
- [ ] Every issue emitted by this stage uses the shared contract from 02; no module-local code is
      introduced.
- [ ] `npm run check` exits 0.

**Tests:**

- Geometry probes for fractional `DPI / LPI`: measured frequency and angle within tolerance.
- Negative-coordinate test: `a = -0.25` yields index `-1` and `alpha = 0.75`, matching the same cell
  reached from a positive offset.
- Canvas tests: values just below, at and just above an exact half; a zero dimension rejects.
- Edge-clamp tests: footprints extending beyond each of the four input sides; weights sum to the cell
  area.
- Clipped-cell test: `marked / visible` over the visible footprint; a fully outside cell produces no
  trace entry.
- Tile test: a tile boundary does not change the lattice origin or phase.
