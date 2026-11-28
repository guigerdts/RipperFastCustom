# 14: Audit follow-up — F2, F3 and F4

Type: task
Status: done
Feature: halftone-engine
Spec ticket: 13 of 13
Spec: ../spec.md

**What to build:** Close the three minor findings from the integral audit of the
halftone engine, with the smallest possible change and without touching the
algorithmic output.

- **F2** — the request's own `output.dpi` is not validated in
  `validateScreeningRequest`; an unusable value (zero, negative, NaN, infinity)
  is rejected later by `geometry` with a `geometry.*` code instead of an
  `output.*` one.
- **F3** — a tile that does not intersect the output canvas is silently ignored
  and the run still reports `completed` with no diagnostic.
- **F4** — `src/engines/halftone/README.md` advertises stochastic screening and
  seed determinism, which v1 does not implement.

**Blocked by:** 13 (the seam is integrated and the audit is closed).

**Out of scope:** streaming / full-image memory gap (F1 stays accepted and
documented), any change to raster values, snapshot values, the performance
baseline, dependencies, or the architecture boundary.

**Acceptance criteria:**

- [x] F2: an unusable `output.dpi` (zero, negative, NaN, Infinity, -Infinity) is
      rejected with one `output.invalid_resolution` error, distinct from
      `output.unsupported_resolution`.
- [x] F2: a finite positive DPI is accepted; the profile's
      `allowedOutputResolutions` policy still applies when declared, and still
      does not apply when absent.
- [x] F2: an unusable DPI does not also produce an
      `output.unsupported_resolution` or a sampling issue derived from it.
- [x] F3: a tile entirely outside the canvas emits one
      `output.tile_beyond_canvas` warning per offending tile and the run still
      completes with zero coverage.
- [x] F3: a partially outside tile is clipped with no diagnostic; an empty tile
      list produces no diagnostic; a full-canvas tile stays byte-identical to
      the whole-image run.
- [x] F3: tiles with negative coordinates that still miss the canvas are
      reported.
- [x] F4: the module README describes AM-only screening, the public seam, the
      contract barrel, the pipeline, snapshot reproducibility, cooperative
      cancellation, the pure-engine restrictions and the full-image memory
      limitation; it no longer mentions stochastic screening or seed
      determinism.
- [x] Raster SHA-256 and snapshot SHA-256 for every recorded baseline fixture
      are unchanged.
- [x] Whole-image and tiled runs remain byte-identical.
- [x] `npm run check` and `npm run build` exit 0.
- [x] GGA passes on every commit.

**Verification evidence:**

- Focused tests: `tests/unit/halftone/validation.test.ts`,
  `tests/acceptance/seam-tiling.test.ts`,
  `tests/unit/halftone/issue-contract.test.ts` — 63 passed.
- Full gate: `npm run check` exit 0 — 40 files passed, 2 skipped;
  561 tests passed, 5 skipped.
- Build: `npm run build` exit 0 — `bundle 30.9 kB`.
- Baseline hashes: all 10 recorded fixtures matched both `rasterSha256` and
  `snapshotSha256` against `tests/performance/baseline.json`, recomputed
  read-only; the baseline file was not modified.
- Whole-image versus tiled identity: `seam-tiling.test.ts` byte identity passed,
  including the new full-canvas tile regression.
- `git diff --check` exit 0.
- Commits: `2f65070` (F2), `92a6cf0` (F3), `2e12626` (F4). Each passed GGA
  through the pre-commit hook; the pinned review model was unavailable, so the
  gate ran on the free `opencode/deepseek-v4.1-flash-free` provider without
  changing `STRICT_MODE`.
- Remote integration: pushed to `origin/master`; every commit above is an
  ancestor of `origin/master` and `HEAD` equals `origin/master` at `09c9897`.

## Comments

- Independent technical review was not available in the runtime: the `subagent`
  tool is permission-denied and the headless fallback crashed. GGA is a static
  pre-commit gate, not an independent audit, and is not presented as one.
