# 07: Area-coverage sampling and per-pixel thresholding for three dot shapes

Type: task
Status: done
Feature: halftone-engine
Spec ticket: 6 of 12
Spec: ../spec.md

**What to build:** Deterministic area-coverage sampling over each cell's footprint, and per-output-
pixel thresholding with the round, elliptical and square spot functions. A flat patch returns its
value; a two-tone patch returns the area-weighted value within one quantisation step. When the cell
footprint is smaller than one input pixel, the containing pixel's value is used and the fallback is
recorded. Output is binary per pixel per channel. Dot area grows monotonically with the reproducible
value for a fixed geometry. Addressability is enumerated from the actual thresholding result, not
from `cell pixels + 1`.

Blocked by: 06

**Issue contract:** Emits only issues registered by the shared contract in 02; no module-local code
is introduced.

**Scope:**

- Exact overlap-area sampling against intersected input pixels.
- Declared supersampling approximation allowed only within the same tolerance.
- Small-cell fallback with a recorded flag.
- Spot functions for `round`, `elliptical` and `square`, normalized to `[0, 1]`.
- Per-pixel threshold decision with a fixed comparison rule.
- Addressability report: distinct digital coverages, `cell_pixel_count` and
  `addressable_coverage_count` separately.

**Out of scope:** FM, hybrid, spot screening, physical dot gain, dot-shape presets and any physical
level inference.

**Acceptance criteria:**

- [x] A flat patch returns the patch value within one tonal quantisation step.
- [x] A two-tone patch returns the area-weighted value within one quantisation step.
- [x] When the cell footprint is smaller than one input pixel, the containing pixel's value is used
      and the fallback is recorded.
- [x] Dot area grows monotonically with the reproducible value for each of the three shapes.
- [x] An unknown dot shape is rejected with a stable issue.
- [x] Addressability is the number of distinct digital coverages the binary rasterization can
      produce, derived from the actual thresholding.
- [x] Addressability changes when the geometry or spot function changes; no hardcoded
      `cell pixels + 1` formula is used.
- [x] `cell_pixel_count` and `addressable_coverage_count` are reported separately.
- [x] Every issue emitted by this stage uses the shared contract from 02; no module-local code is
      introduced.
- [x] `npm run check` exits 0.

**Tests:**

- Sampling tests: flat patch, two-tone patch, and a footprint crossing several input pixels.
- Small-cell test: cell smaller than an input pixel uses the containing pixel and records the
  fallback.
- Monotonic sweep: for each shape, increasing the reproducible value never decreases the marked
  area.
- Addressability test: enumerate the actual coverages for two geometries and assert the count and
  set change as expected.
- Unknown-shape test: rejection with a stable code.

## Implementation

**Module:** `src/engines/halftone/screening.ts` (pure, synchronous; no host, DOM, I/O, network or
randomness). It exports:

- `createSpotFunction(shape)` — accepted/rejected normalized spot function; `threshold(alpha, beta)`
  returns the per-pixel value in `[0, 1]`, zero at the cell centre.
- `sampleCellValue({ footprint, image })` — exact area-coverage sample
  `sum(weight * pixel) / sum(weight)` using `coverageWeights`; records `fallback: 'containing-pixel'`
  when the footprint pitch is below one input pixel and `'none'` otherwise.
- `rasterizeCell({ footprint, canvas, lattice, value, dotShape })` — per-visible-pixel decision
  `value > threshold`, `marked` count, `visible` count, `fraction = marked / visible` (or `null` when
  the cell is not evaluated) and the per-pixel decisions.
- `computeAddressability({ lattice, canvas, dotShape })` — union of the coverages the thresholding
  can produce over unclipped cells, with `cellPixelCount`, `cellPixelCounts`,
  `addressableCoverageCount`, `coverages` and `cellsEvaluated`.

**Types:** `src/engines/halftone/contracts/screening.ts` adds `DotShape`, `SamplingImage`,
`SamplingFallback`, `SpotFunction`, `SpotFunctionResult`, `SampleCellInput`, `SampleCellResult`,
`ScreenPixelDecision`, `RasterizeCellInput`, `RasterizeCellResult`, `AddressabilityInput`,
`AddressabilityReport` and `AddressabilityResult`. Each result union exposes its `Accepted*` and
`Rejected*` members. Exported through `contracts/index.ts`.

**Registered codes:** one new central code in `src/engines/halftone/contracts/issue.ts`, severity
`error`, scope `geometry`: `geometry.unknown_dot_shape`. Malformed input reuses
`geometry.invalid_input`; no module-local code is introduced.

## Decisions

- **Sampling space.** The footprint is built from the input-space lattice
  (`createLattice({ resolution: ppi, lpi, angle })`), so the physical cell side `1 / LPI` is measured
  in input pixels and sampling is independent of the output DPI. The value is
  `sum(weight * pixel) / sum(weight)`; `coverageWeights` partitions the footprint area exactly and
  clamps out-of-range pixels to the border.
- **Small-cell fallback.** When the footprint pitch is below one input pixel, the value of the pixel
  containing the footprint centroid is used and `fallback: 'containing-pixel'` is recorded; otherwise
  `fallback: 'none'`. The threshold is strict (`pitch < 1`), so `pitch = 1` still samples.
- **Spot functions.** Normalized to `[0, 1]`, zero at the cell centre `(0.5, 0.5)`:
  `round = hypot(2a - 1, 2b - 1) / sqrt(2)`; `elliptical = min(1, hypot(2a - 1, (2b - 1) / 2) /
hypot(1, 0.5))` (declared 2:1 aspect); `square = max(|2a - 1|, |2b - 1|)`.
- **Threshold rule.** Strict: a pixel is marked when `value > threshold`. A value equal to the
  threshold leaves the pixel unmarked and value `0` marks nothing; the boundary is pinned by test.
- **Clipped semantics.** A cell that is clipped or has no visible pixel is not evaluated and
  contributes no addressability. The cell fraction is `marked / visible`.
- **Addressability is continuous, not quantized.** Spec §8 lists requested tonal values as a
  separate concept from digital addressable coverages, and `AddressabilityInput` carries no tonal
  precision, so the report is the set of fractions reachable as the value sweeps `[0, 1]`; for the
  integer-pitch geometries in the tests it coincides with the 16-bit producible set.
- **Threshold ties are collapsed within a tolerance.** Two pixels that are symmetric in the cell get
  mathematically equal spot values, but `locateCell` reaches them through different floating-point
  paths, so their computed thresholds can differ by a few ulps (~2e-16). Treating such a gap as a
  real interval fabricated a coverage inside a 1e-16-wide window and degenerated a rotated cell to
  `cell pixels + 1` (38 coverages for 37 pixels), and made a congruent angle-0 geometry report a
  different set on a larger canvas. `achievableCoverages` now treats gaps at or below `1e-12` as
  equal; the bound is far below any declared tonal precision, so no reproducible coverage is lost.
- **Addressability is not `cell pixels + 1`.** Reachable marked counts are `k = 0` plus every `k`
  with `t[k-1] < 1` and (`k = visible` or `t[k-1] < t[k]`), so ties collapse counts and the count is
  derived from the actual thresholds.

## Verification

- **Focused:** `tests/unit/halftone/screening.test.ts` — 27 tests pass; the independent
  `tests/unit/halftone/screening-probes.test.ts` — 10 tests pass (37 together).
- **Full gate:** `npm run check` — exit 0 (typecheck + lint + format:check + **318 passed, 4
  skipped**; the skipped ones are the Photoshop-host integration tests).
- **Build:** `npm run build` — clean, bundle 30.9 kB.
- **Whitespace:** `git diff --check` — clean.
- **Addressability evidence:** pitch 2 round → `[0, 1]` with `cellPixelCount 4`; pitch 3 round →
  `[0, 1/9, 5/9, 1]` with `cellPixelCount 9`, identical on 3×3, 30×30 and 31×31 canvases; pitch 3
  square → `[0, 1/9, 1]`; pitch 4 round → `[0, 1/4, 3/4, 1]` with `cellPixelCount 16`; pitch 6 at
  30° → 37 coverages for a 37-pixel cell.

## Review and corrections

- **GGA (`gga run`, opencode provider, STRICT_MODE):** **STATUS: PASSED** on the 5 staged files
  (screening module, contracts, issue registry, main suite, probes). The pre-commit hook then passed
  from cache; no bypass. Non-blocking observation: the probe fixture uses
  `as unknown as CellFootprint`; ESLint and the standards allow it, and adopting
  `@total-typescript/shoehorn` for one test fixture was not worth a dependency.
- **Independent AI technical review** (`opencode run --agent gentle-ai-verify`, read-only, baseline
  `c5dc620`): the reviewer read spec §7–§8, this ticket, the contracts, the implementation and the
  geometry API, then built its own probe suite in a scratch copy. Two provider models hit free-usage
  limits mid-run (`mimo-v2.6-flash-free` after observing 27/27 focused tests and a clean build;
  `deepseek-v4.1-flash-free` after writing the probes), so the verdict text was lost, but the
  probes survived and were adopted.
- **Blocker found and fixed:** the reviewer's brute-force and canvas-invariance probes exposed that
  ulp-level threshold ties fabricated coverages. Consequences: `lattice(3, 1, 0)` round reported
  `[0, 1/9, 1/3, 5/9, 1]` on a 30×30 canvas but `[0, 1/9, 5/9, 1]` on 3×3, and `lattice(6, 1, 30)`
  round reported 38 coverages for a 37-pixel cell — exactly `cell pixels + 1`. Fixed with the
  `THRESHOLD_TIE_TOLERANCE` collapse in `achievableCoverages`; the threshold rule itself is
  unchanged.
- **Reviewer expectation corrected:** the first probe expected pitch 4 round to include `1/16`,
  which assumes one pixel marks at a time. The four centre pixels share threshold `0.25`, so the set
  is `[0, 1/4, 3/4, 1]`; the reviewer's own trimmed suite carries the corrected value.
- **Durable probes adopted:** the reviewer's 9 trimmed probes plus one regression pin for the
  rotated ulp-tie case are committed as `tests/unit/halftone/screening-probes.test.ts` (10 tests).
  After the fix, 9/9 trimmed probes and all 10 committed probes pass.
- **Re-verification after corrections:** focused 37 tests pass; `npm run check` exit 0 (318 passed,
  4 skipped); build 30.9 kB; `git diff --check` clean; GGA PASSED on the corrected set.

## Integration

- **Commit:** `2055243 feat(halftone): add area-coverage sampling and dot-shape thresholding`
  (5 files, +1492/−0).
- **GGA:** PASSED before commit; the pre-commit hook passed from cache (5 files).
- **Remote:** pushed `c5dc620..2055243 master -> master` (no force). `master` is unprotected, has no
  CI workflow and requires no PR, so the direct push is the established integration path.
- **Final state at integration:** `HEAD == origin/master == 2055243`, ahead/behind 0/0, clean
  worktree.
- **Next pending ticket:** 08 (`08-result-snapshot.md`).
