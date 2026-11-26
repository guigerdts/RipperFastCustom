# 12: Performance and memory benchmark harness

Type: task
Status: ready-for-agent
Feature: halftone-engine
Spec ticket: 11 of 12
Spec: ../spec.md

**What to build:** Measurable performance and memory requirements, not absolute wall-clock numbers
tied to unnamed hardware. The benchmark covers 1, 4 and 16 megapixels, 1, 4 and 8 channels, and 8-
and 16-bit input. It records elapsed time and peak memory for the declared fixtures, asserts that
quadrupling output pixels does not exceed six times the smaller run, and asserts that peak memory
stays within the input bytes plus the output bytes plus a declared per-row or per-tile bound. The
first implementation records a baseline on a declared reference environment; later changes compare
against it with a relative regression threshold. No global cache grows with the number of jobs.

**Blocked by:** 08 (result and snapshot).

**Execution note:** May run in parallel with the other tickets blocked only by 08 when edit surfaces
are disjoint; otherwise sequential.

**Scope:**

- Benchmark fixtures for the declared sizes, channel counts and bit depths.
- Elapsed-time and peak-memory measurement.
- Scaling and memory-bound assertions.
- Baseline recording on a declared reference environment.
- No-hidden-cache check.

**Out of scope:** absolute wall-clock budgets before a baseline exists, new dependencies, package
script changes and production telemetry.

**Acceptance criteria:**

- [ ] The benchmark records elapsed time and peak memory for the declared fixtures.
- [ ] Quadrupling output pixels does not exceed six times the elapsed time of the smaller run.
- [ ] Peak additional memory does not exceed input bytes plus output bytes plus the declared
      per-row or per-tile bound.
- [ ] The first run records a baseline on a declared reference environment; later comparisons use a
      relative threshold.
- [ ] No global cache grows with the number of images or jobs.
- [ ] The benchmark runs in the existing test runner without adding a dependency.
- [ ] The benchmark measures the reference implementation without adding caches, LUTs or shortcuts
      that are not already specified; any optimization is a separate change that must keep the
      reference tests green.
- [ ] `npm run check` exits 0.

**Tests:**

- Scaling test: 1x and 4x output-pixel fixtures; assert the time ratio bound.
- Memory test: measure peak additional memory for each fixture; assert the declared bound.
- Baseline test: the baseline is recorded and a simulated regression exceeds the relative
  threshold.
- Cache test: repeated runs do not increase retained memory or global state.
