# 14: Audit follow-up — F2, F3 and F4

Type: task
Status: ready-for-agent
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

- [ ] F2: an unusable `output.dpi` (zero, negative, NaN, Infinity, -Infinity) is
      rejected with one `output.invalid_resolution` error, distinct from
      `output.unsupported_resolution`.
- [ ] F2: a finite positive DPI is accepted; the profile's
      `allowedOutputResolutions` policy still applies when declared, and still
      does not apply when absent.
- [ ] F2: an unusable DPI does not also produce an
      `output.unsupported_resolution` or a sampling issue derived from it.
- [ ] F3: a tile entirely outside the canvas emits one
      `output.tile_beyond_canvas` warning per offending tile and the run still
      completes with zero coverage.
- [ ] F3: a partially outside tile is clipped with no diagnostic; an empty tile
      list produces no diagnostic; a full-canvas tile stays byte-identical to
      the whole-image run.
- [ ] F3: tiles with negative coordinates that still miss the canvas are
      reported.
- [ ] F4: the module README describes AM-only screening, the public seam, the
      contract barrel, the pipeline, snapshot reproducibility, cooperative
      cancellation, the pure-engine restrictions and the full-image memory
      limitation; it no longer mentions stochastic screening or seed
      determinism.
- [ ] Raster SHA-256 and snapshot SHA-256 for every recorded baseline fixture
      are unchanged.
- [ ] Whole-image and tiled runs remain byte-identical.
- [ ] `npm run check` and `npm run build` exit 0.
- [ ] GGA passes on every commit.

## Comments

- 2026-11-28 — Implementation is in progress on `master`: the three fixes and
  their tests are committed locally and have passed GGA. The ticket closes only
  after the commits are pushed and verified on `origin/master`.
- Independent technical review was not available in the runtime: the `subagent`
  tool is permission-denied and the headless fallback crashed. GGA is a static
  pre-commit gate, not an independent audit, and is not presented as one.
