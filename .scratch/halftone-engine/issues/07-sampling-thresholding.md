# 07: Area-coverage sampling and per-pixel thresholding for three dot shapes

Type: task
Status: ready-for-agent
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

**Blocked by:** 06 (AM geometry).

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

- [ ] A flat patch returns the patch value within one tonal quantisation step.
- [ ] A two-tone patch returns the area-weighted value within one quantisation step.
- [ ] When the cell footprint is smaller than one input pixel, the containing pixel's value is used
      and the fallback is recorded.
- [ ] Dot area grows monotonically with the reproducible value for each of the three shapes.
- [ ] An unknown dot shape is rejected with a stable issue.
- [ ] Addressability is the number of distinct digital coverages the binary rasterization can
      produce, derived from the actual thresholding.
- [ ] Addressability changes when the geometry or spot function changes; no hardcoded
      `cell pixels + 1` formula is used.
- [ ] `cell_pixel_count` and `addressable_coverage_count` are reported separately.
- [ ] Every issue emitted by this stage uses the shared contract from 02; no module-local code is
      introduced.
- [ ] `npm run check` exits 0.

**Tests:**

- Sampling tests: flat patch, two-tone patch, and a footprint crossing several input pixels.
- Small-cell test: cell smaller than an input pixel uses the containing pixel and records the
  fallback.
- Monotonic sweep: for each shape, increasing the reproducible value never decreases the marked
  area.
- Addressability test: enumerate the actual coverages for two geometries and assert the count and
  set change as expected.
- Unknown-shape test: rejection with a stable code.
