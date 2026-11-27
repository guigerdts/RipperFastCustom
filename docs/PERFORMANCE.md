# Halftone performance and memory

This document records how the halftone engine's performance and memory are
measured, the declared reference environment, the recorded baseline, and the
known limits of the reference implementation. The requirements live in
[`.scratch/halftone-engine/spec.md`](../.scratch/halftone-engine/spec.md) §13 and
[`.scratch/halftone-engine/issues/12-performance-memory.md`](../.scratch/halftone-engine/issues/12-performance-memory.md).

## Declared reference environment

Measurements were recorded on the development host, not on production hardware:

| Property     | Value                                          |
| ------------ | ---------------------------------------------- |
| Runtime      | Node.js v22.23.3                               |
| Platform     | Ubuntu on Termux/proot                         |
| Architecture | linux / arm64                                  |
| CPU          | 8 × Cortex-A55                                 |
| Total RAM    | 7.4 GB (about 2.4 GB available during capture) |
| Swap         | enabled and in use                             |

The environment fingerprint stored in `baseline.json` is
`node|platform|arch|cpuModel`. A different environment is still measured, but the
committed wall-clock numbers are only meaningful on the recorded fingerprint; the
relative regression threshold is what later comparisons assert.

## Fixtures

Fixtures are synthetic and deterministic; no physical preset and no randomness
are involved. The declared matrix is every combination of:

- 1, 4 and 16 megapixels (1000², 2000², 4000² pixels);
- 1, 4 and 8 tone channels;
- 8- and 16-bit input.

One-channel fixtures are grayscale and use the declared channel-preserving
grey-to-black mapping. Multi-channel fixtures use an RGB input and a declared
row-stochastic linear-mixing matrix, because channel-preserving mapping admits
only one input channel per tone channel. Screening is AM at 25 lpi, 300 dpi,
round dot, with distinct screen angles per channel. The input is a deterministic
diagonal ramp that includes intermediate values at both bit depths, so the
prepared-artwork distribution check never rejects it.

`tests/performance/fixtures.ts` owns the declarations. The default suite uses
reduced "smoke" fixtures that exercise the same engine paths inside a bounded
budget; the full matrix is covered by the baseline capture and by the baseline
schema test, which requires an entry for every declared fixture.

## Method

- Fixtures are built outside the timed region; preparation time is recorded
  separately and never enters the elapsed time.
- A small warm-up run excludes one-time module work.
- Timing is `performance.now()` around the public `assembleScreeningResult`
  seam; isolated stage timings use a cancellation token after setup.
- Each fixture records its samples, median, minimum and maximum. The default
  scaling test interleaves the smaller and quadrupled runs so transient host load
  affects both sides of the ratio.
- The authoritative baseline capture runs alone, with no other test file or
  worker competing for the CPU.
- Peak memory is the process high-water mark (`process.resourceUsage().maxRSS`)
  above the RSS sampled immediately before the fixture is built. The kernel
  high-water mark can never be below the true peak, so the number cannot hide an
  overflow.
- Retained buffers are the change in `process.memoryUsage().arrayBuffers`; the
  repeated-run check uses this to detect a cache or global that grows per job.
- Results are hashed with SHA-256 over the rasters and the canonical snapshot so
  the baseline also pins byte identity.

## Memory model

The declared bound is:

```
input bytes
+ output bytes (one byte per output pixel per channel)
+ full-image stage workspace
+ a fixed process-overhead allowance
```

The stage workspace models the reference implementation's planes per sample:

| Plane                                                     | Bytes per sample    |
| --------------------------------------------------------- | ------------------- |
| Normalised sampling planes (one per input channel)        | 8 each              |
| Separation plane (per tone channel)                       | 2                   |
| Tonal planes kept for the snapshot (two per tone channel) | 2 each              |
| Final sampling plane                                      | 8                   |
| Transient screening headroom (GC lag)                     | 64 per output pixel |

The fixed process-overhead allowance is 96 MiB. It covers V8, Node and the test
runner's baseline resident set, which does not scale with the image.

**Known gap.** The performance section asks that no stage keep a full-image
intermediate beyond a per-row or per-tile bound. The reference implementation
does keep full-image stage planes (separation and tonal), so the honest declared
bound is the full-image workspace above, not a streaming per-row bound. Ticket 12
records and enforces the reference implementation's real bound. Closing the gap
to a streaming design is a separate optimisation change that must keep the
recorded raster hashes identical; it is not attempted here.

## Recorded baseline

Measured on the declared environment with one sample per fixture. `Peak` is the
additional resident set above the pre-fixture RSS; `Bound` is the declared
`input + output + workspace + overhead` for that fixture.

| Fixture            | Median (ms) | Peak (MiB) | Bound (MiB) |
| ------------------ | ----------: | ---------: | ----------: |
| 1 MP, 1 ch, 8-bit  |       1,988 |         45 |         180 |
| 1 MP, 1 ch, 16-bit |       2,132 |         26 |         182 |
| 1 MP, 4 ch, 8-bit  |      12,036 |         49 |         213 |
| 1 MP, 4 ch, 16-bit |      11,623 |         54 |         219 |
| 1 MP, 8 ch, 8-bit  |      24,604 |         57 |         236 |
| 1 MP, 8 ch, 16-bit |      25,087 |         52 |         254 |
| 4 MP, 1 ch, 8-bit  |       7,602 |         61 |         336 |
| 4 MP, 1 ch, 16-bit |       7,800 |         61 |         341 |
| 4 MP, 4 ch, 8-bit  |      57,951 |        194 |         572 |
| 16 MP, 1 ch, 8-bit |      98,798 |        309 |       1,405 |

Every recorded fixture stays inside its declared bound. rasters are exactly
`width × height × channels` bytes and both hashes are stored in `baseline.json`.

### Unavailable fixtures

The reference environment cannot run these inside its capture budget, so the
baseline records the reason instead of an invented number:

- 4 MP, 4 ch, 16-bit and 4 MP, 8 ch, 8-bit: above the 60 s per-fixture budget.
- 4 MP, 8 ch, 16-bit: measured once at about 159 s, above budget.
- All 16 MP fixtures except 1 ch, 8-bit: the stage workspace plus process
  overhead approaches or exceeds the available RAM while the host swaps.

## Scaling and bottlenecks

Quadrupling output pixels on the interleaved default-suite fixtures stays well
inside the six-times bound:

| Comparison                     | Ratio |
| ------------------------------ | ----: |
| 250² → 500², 1 channel         | ~3.2× |
| 250² → 500², 4 channels        | ~3.6× |
| 1 MP → 4 MP, 1 channel, 8-bit  | 3.82× |
| 1 MP → 4 MP, 4 channels, 8-bit | 4.81× |

Two measured superlinear effects are recorded honestly rather than smoothed over:

1. **4 MP → 16 MP, 1 channel** takes 98.8 s against 7.6 s, a **13×** ratio for
   four times the pixels. The stage planes at 16 MP (hundreds of MiB) exceed the
   CPU cache and the host is already swapping; this is a memory-bandwidth and
   pressure cliff, not an algorithmic quadratic. It is the reason the six-times
   scaling bound is asserted on the sizes the reference environment can measure
   reliably, and why all 16 MP fixtures beyond 1 ch, 8-bit are marked unavailable.
2. **Channel cost is superlinear per channel**: at 1 MP the 1-, 4- and 8-channel
   runs take about 1.99 s, 3.01 s and 3.08 s per channel. The per-channel stage
   planes grow with the channel count, so the working set leaves cache and the
   allocator works harder.

The dominant cost is the screening stage's per-cell allocation: each cell
materialises its coverage weights and a `ScreenPixelDecision` record per visible
output pixel. The operations are linear in pixels, but the allocation churn
drives garbage collection and memory bandwidth. Removing that churn, and moving
the stage planes to a streaming per-row layout, are the two optimisations the
measurements support. Both are separate changes: the reference implementation is
measured as specified, without caches, LUTs or shortcuts.

## Running the benchmark

Default suite (bounded, part of `npm test` and `npm run check`):

```sh
npx vitest run tests/performance
```

- `scaling.test.ts` — interleaved quadrupling bound and the declared-budget
  sanity checks.
- `memory.test.ts` — peak within the declared bound and raster size per fixture.
- `determinism.test.ts` — repeated runs and whole-image versus tiled runs are
  byte-identical, and the input buffer is never mutated.
- `cache.test.ts` — repeated runs do not grow retained buffers or global state.
- `baseline.test.ts` — schema, full declared-matrix coverage, and a simulated
  regression against the relative threshold.

Manual baseline capture (isolated, writes `baseline.json`):

```sh
CAPTURE_BASELINE=1 npx vitest run tests/performance/capture-baseline.test.ts
```

Re-capture only when the engine or the declared reference environment changes,
then review the diff: the raster and snapshot hashes pin behaviour, the wall-clock
numbers describe the environment, and unavailable entries must keep a real reason.

## Limitations

- Wall-clock numbers are specific to the recorded fingerprint and are not a
  portable budget. Later comparisons use the relative threshold (1.6×).
- The baseline records one sample per fixture. The relative threshold absorbs
  ordinary host noise; the default scaling test additionally interleaves runs.
- The reference environment cannot measure the 16 MP, multi-channel corner of the
  matrix. Those entries stay `unavailable` with reasons; nothing is extrapolated
  into the baseline.
- Memory is process-level, not engine-level. The fixed overhead allowance is
  declared once and does not grow with the job, but it is still part of the bound.
