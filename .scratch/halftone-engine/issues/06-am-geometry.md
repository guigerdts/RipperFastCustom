# 06: AM geometry: global lattice, angle, sub-pixel placement and boundaries

Type: task
Status: done
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

- [x] For a non-integer `output DPI / LPI` ratio, the measured frequency and angle stay within the
      declared tolerance, and changing output DPI does not change the cell's physical size.
- [x] The lattice origin, phase and basis are the declared global ones; a tile boundary never
      re-anchors or shifts the lattice.
- [x] Cell indexing uses `floor` on inverse-basis coordinates, so negative coordinates yield negative
      indices with `alpha` and `beta` in `[0, 1)`; truncation toward zero is absent.
- [x] A cell reached from a negative coordinate matches the same cell reached from a positive
      offset.
- [x] The canvas dimension is `floor(x + 0.5)` on non-negative values; exact halves round up; a
      computed dimension of zero is rejected as `geometry.empty_canvas`.
- [x] No intermediate geometry value is rounded to an integer; only the canvas dimension is rounded.
- [x] Edge-clamp replicates border pixels, and coverage weights sum to the cell area for footprints
      extending beyond any input side.
- [x] A clipped cell reports `clipped: true` with `marked / visible` over the canvas-clipped
      footprint; a cell with zero visible pixels is not evaluated.
- [x] Every issue emitted by this stage uses the shared contract from 02; no module-local code is
      introduced.
- [x] `npm run check` exits 0.

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

## Implementation

**Module:** `src/engines/halftone/geometry.ts` (pure, synchronous; no host, DOM, I/O, network or
randomness). It exports:

- `roundHalfUp(value)` — the single declared rounding rule, `floor(x + 0.5)`.
- `createLattice({ resolution, lpi, angle })` — accepted/rejected global lattice; `resolution` is
  output DPI (output space) or input PPI (input space), so the physical cell side is `1 / LPI`
  inch in either space.
- `locateCell(point, lattice)` — floor-based cell index and in-cell `alpha`/`beta`.
- `cellFootprint(i, j, lattice)` — the four cell corners on the declared basis.
- `computeCanvas({ inputWidth, inputHeight, ppi, dpi })` — physical extent and the rounded output
  raster.
- `clampInputPixel(x, y, width, height)` — floor-then-clamp edge extension.
- `coverageWeights({ polygon, width, height })` — exact clipped-area weights per clamped pixel.
- `polygonArea`, `pointInPolygon` — shoelace area and even-odd containment.
- `enumerateVisibleFootprint(footprint, canvas)` — `clipped`, `visible` and the visible pixels.
- `screenFraction(marked, visible)` — `marked / visible`, or `null` when the cell is not evaluated.

**Types:** `src/engines/halftone/contracts/geometry.ts` adds `Vector2`, `Lattice`, `CellAddress`,
`CellFootprint`, `CanvasDimensions`, `CoverageWeight`, `VisibleFootprint`, `LatticeInput`,
`CanvasInput`, `CoverageInput`, `LatticeResult` and `CanvasResult`, plus the frozen
`LATTICE_ORIGIN` / `LATTICE_PHASE` constants. Exported through `contracts/index.ts`.

**Registered codes:** two new central codes in `src/engines/halftone/contracts/issue.ts`, both
severity `error`, scope `geometry`:

- `geometry.invalid_input` — malformed parameters (negative or non-finite dimensions, non-positive
  PPI/DPI, a non-record input, or a non-finite computed canvas).
- `geometry.empty_canvas` — a computed output dimension of zero, whether from a zero input dimension
  or from the physical size rounding down.

No module-local code is introduced.

## Decisions

- **Angular convention.** `x` right, `y` down; `0°` is 9 o'clock (`−x`), positive angles clockwise.
  With `pitch = resolution / lpi`: `u = pitch·(−cosθ, −sinθ)` and `v = pitch·(sinθ, −cosθ)`
  (`v` is `u` rotated 90° clockwise). Both have length `pitch` and are orthogonal.
- **Floor indexing.** `a = dot(p − origin − phase, u) / dot(u, u)` and
  `b = dot(p − origin − phase, v) / dot(v, v)`; `i = floor(a)`, `j = floor(b)`, `alpha = a − i`,
  `beta = b − j`. `floor`, not truncation, keeps `alpha`/`beta` in `[0, 1)` for negative
  coordinates. `a = −0.25` gives `i = −1`, `alpha = 0.75`.
- **Global lattice.** `origin` and `phase` are the frozen constants `{0, 0}`. Every tile and block
  rebuilds the same lattice from the same parameters and addresses points in global coordinates, so
  no tile boundary can re-anchor or phase-shift it.
- **Canvas rounding.** Only the output dimension is rounded, with `floor(x + 0.5)`. `pitch`,
  `physicalWidth`/`physicalHeight` and `alpha`/`beta` stay in double precision. A zero computed
  dimension rejects with `geometry.empty_canvas`; malformed parameters reject with
  `geometry.invalid_input`.
- **Edge clamp.** Out-of-range area elements replicate the nearest border pixel:
  `floor(x)` then clamp to `[0, width − 1] × [0, height − 1]`. Coverage weights intersect the
  footprint with each input pixel and attribute the exact overlap area to the clamped pixel, so the
  weights always sum to the footprint area and no area is dropped or renormalised at a border.
- **Clipped semantics.** `clipped` is true when the full footprint is not contained in
  `[0, width] × [0, height]`. `visible` counts output pixel centres inside both the cell and the
  canvas. `screenFraction(marked, visible)` is `marked / visible` and `null` when `visible` is not a
  positive integer (a fully clipped cell is not evaluated) or `marked` is non-finite; the ratio is
  never clamped, so a bad measure surfaces instead of being hidden.
- **Signed zero.** The basis collapses `−0` to `0`, because a geometry value other code compares and
  serialises should not carry a meaningless signed-zero distinction.

## Verification

- **Focused:** `tests/unit/halftone/geometry.test.ts` — 39 tests pass; the independent
  `tests/unit/halftone/geometry-probes.test.ts` — 8 tests pass.
- **Full gate:** `npm run check` — exit 0 (typecheck + lint + format:check + **281 passed, 4
  skipped**).
- **Build:** `npm run build` — clean, bundle 30.9 kB.
- **Whitespace:** `git diff --check` — clean.

## Review and corrections

- **GGA (`gga run`, opencode provider, STRICT_MODE):** first pass **STATUS: PASSED** on the 5
  implementation files. After adding the independent probes and documenting the `screenFraction`
  guard, the second pass **PASSED** (2 changed files reviewed, 4 cached).
- **Independent AI technical review** (`opencode run --agent gentle-ai-verify`, read-only, baseline
  `f4e43fc`): **all 10 acceptance criteria met, no blockers.** The first model
  (`deepseek-v4.1-flash-free`) hit a provider free-usage limit after observing 39/39 focused and
  273/273 full tests in its scratch copy; the review was completed with
  `opencode/mimo-v2.6-flash-free`. The reviewer built its own 21-probe suite (one self-corrected
  expectation, then 21/21 green), a 4×4/2×2 edge-overhang area check, and an engine-purity scan
  (no host/DOM/I/O/randomness).
- **Advisory (non-blocking):** `screenFraction(Number.NaN, 4)` returns `null` rather than `NaN`.
  `marked` is a pixel count, so a non-finite value is outside the realistic domain; the guard is now
  documented on the function.
- **Corrections applied:** added the reviewer's 8 durable probes as
  `tests/unit/halftone/geometry-probes.test.ts`; documented the non-finite `marked` guard. No
  behavioural change was required.
- **Re-verification after corrections:** focused 47 tests pass; `npm run check` exit 0 (281 passed,
  4 skipped); build 30.9 kB; `git diff --check` clean.

## Integration

- **Commit:** `f36c068 feat(halftone): implement AM geometry with global lattice and canvas rounding`
  (6 files, +1402/−0).
- **GGA:** PASSED before commit; the pre-commit hook passed from cache (6 files).
- **Remote:** pushed `f4e43fc..f36c068 master -> master` (no force). `master` is unprotected, has no
  CI workflow and requires no PR, so the direct push is the established integration path for this
  repository.
- **Final state at integration:** `HEAD == origin/master == f36c068`, ahead/behind 0/0, clean
  worktree.
- **Next pending ticket:** 07 (sampling and thresholding).
