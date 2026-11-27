# 10: Preview mode through the same pipeline

Type: task
Status: done
Feature: halftone-engine
Spec ticket: 9 of 12
Spec: ../spec.md

**What to build:** An explicit preview mode that reuses the same input validation, separation, tonal
chain, geometry, sampling and thresholding logic with a reduced effective output DPI, expressed as a
declared integer divisor of the output DPI or as a target preview DPI. A preview result is flagged,
records its effective resolution, allocates no full-resolution rasters and cannot be accepted by the
output or export contract as a production result. It adds an informational preview issue.

**Blocked by:** 08 (result and snapshot).

**Execution note:** May run in parallel with the other tickets blocked only by 08 when edit surfaces
are disjoint; otherwise sequential.

**Scope:**

- Preview request flag and effective-resolution derivation.
- Shared pipeline with reduced effective DPI.
- Preview flag and effective resolution in the result and snapshot.
- Informational preview issue.
- Output/export rejection of preview results.

**Out of scope:** a separate preview algorithm, preview UI and export wiring.

**Acceptance criteria:**

- [x] A preview result is flagged `preview: true` and records its effective preview resolution in
      the snapshot.
- [x] Preview uses the same validation, separation, tonal chain, geometry, sampling and thresholding
      logic as a full run.
- [x] Preview allocates no full-resolution rasters.
- [x] A preview result cannot be accepted by the output/export contract as a production result.
- [x] Preview produces an informational preview issue.
- [x] `npm run check` exits 0.

> Note on the first box: the snapshot records `preview: { enabled: true, resolution }` and keeps
> `output.dpi` as the declared production DPI; the effective raster resolution is `preview.resolution`
> and `canvas.suppliedDpi`. That pair is what the output contract needs to name both values.
>
> Note on the last box: `npm run check` cannot complete in this environment — its parallel file
> workers abort on `uv__io_poll`/`futex`. The four steps the script runs were executed sequentially
> (`tsc --noEmit`, `eslint .`, `prettier --check .`, `vitest run --no-file-parallelism`); all four
> pass. The failure is environmental, not a code defect.

**Tests:**

- Geometry comparison: preview and full runs use the same lattice and angle logic at their
  respective effective DPIs.
- Flag test: preview result is flagged and records its effective resolution.
- Allocation test: peak allocation stays below the full-resolution bound.
- Output-contract test: a preview result is rejected as production output.
- Issue test: the informational preview issue is present and correctly scoped.

## Implementation record

- **Request contract.** `PreviewSettings` is an explicit union: `{ mode: 'divisor', divisor }` or
  `{ mode: 'target-dpi', dpi }`. `ScreeningRequest.preview` is optional. `output.dpi` always remains
  the production resolution the profile is asked to meet; preview does not rewrite it.
- **Resolution derivation.** `resolvePreview` (new `src/engines/halftone/preview.ts`) owns the two
  decisions: the effective resolution and whether the setting is usable. A divisor must be an
  integer of at least 2 (1 would reproduce the full raster); a target DPI must be finite, positive
  and strictly below production. An unusable setting is rejected with `preview.invalid_settings`
  (error, preview scope) before separation or any output buffer is allocated. An invalid production
  DPI is left to canvas computation, which already owns that diagnosis, so preview does not emit a
  duplicate code.
- **Shared pipeline.** The pipeline resolves preview after request validation and before separation.
  `computeCanvas` receives the effective resolution, and every later stage — separation, tonal
  chain, lattice, sampling, thresholding, addressability — runs unchanged at that resolution. The
  raster bound `MAX_RASTER_PIXELS` therefore applies to the reduced canvas, and no full-resolution
  output buffer is ever allocated.
- **Result and snapshot.** `snapshot.preview` records `{ enabled, resolution }`; `snapshot.output.dpi`
  records the declared production DPI and `canvas.suppliedDpi` records the effective one. The
  preview block is part of the sealed hash, so a preview snapshot is distinct from a production one.
- **Informational issue.** `preview.requested` (info, preview) records the mode, production DPI,
  effective resolution and the divisor or target DPI.
- **Output contract.** New `src/engines/halftone/contracts/output.ts` exposes
  `acceptForProduction(result)`. A completed preview is refused with `output.preview_not_accepted`
  (error, output), naming the effective preview resolution and the declared production DPI.
  Rejected and cancelled results pass through with their own diagnostics. The refusal is passed
  through `finalizeIssues`, so `output` sorts before `preview` deterministically.
- **Taxonomy.** `preview.invalid_settings` and `output.preview_not_accepted` were added to the central
  registry; `preview.requested` moved from reserved vocabulary to emitted. `geometry.clipped_trace`
  remains reserved for the trace API.
- **Production validation stays production-scoped.** `validateScreeningRequest` still evaluates the
  declared production DPI; preview does not re-run the minimum-cell-pixels check at the reduced DPI.
  A preview is explicitly not a production result and cannot be exported, and the per-channel
  `addressability` report inside the result does use the effective preview resolution. This is a
  deliberate boundary, not an omission.

## Verification

- **Focused suites:** `preview-resolution.test.ts` 13 tests, `preview.test.ts` 11,
  `output-contract.test.ts` 5, `warning-taxonomy.test.ts` 42, `result.test.ts` 22 — all pass.
- **Pipeline equivalence:** a divisor-2 preview of a 100 DPI request and a direct production run at
  50 DPI produce byte-identical rasters, identical channel metadata and identical snapshot fields
  except the declared output target and the preview block.
- **Full suite:** `npx vitest run --no-file-parallelism` — 434 passed, 4 skipped (25 files passed,
  1 integration file skipped).
- **Typecheck, lint, format:** `tsc --noEmit`, `eslint .`, `prettier --check .` — all clean.
- **Build:** `npm run build` — clean, bundle 30.9 kB.
- **Whitespace:** `git diff --check` — clean.
- **Repository state:** `master == origin/master == 3be14ad`, working tree clean.

## Review and corrections

- **GGA pre-commit (`opencode:google/gemini-3.5-flash-lite`, STRICT_MODE):** STATUS: PASSED on
  `696043d` (request contract and resolution) and `03d1474` (pipeline integration). The third slice
  `3be14ad` returned an empty/ambiguous response on the first two attempts and on a manual
  `gga run --no-cache`; after a pause the provider returned STATUS: PASSED and the hook accepted the
  same commit. STRICT_MODE was never disabled and no `--no-verify` was used.
- **Independent verifier unavailable.** A `gentle-ai-verify` subagent launch returns
  `permission.rejected: Permission denied: subagent` in this runtime, so no independent
  requirement-by-requirement verdict was produced. Substitute evidence: GGA reviewed each of the
  three slices, and the pipeline-equivalence test compares preview against a direct production run.
  This is an external review of the change, not an independent per-requirement audit.
- **Commit budget.** The change was split into three slices of 216, 259 and 186 authored changed
  lines so each commit fits the 400-line GGA budget and leaves the tree green.
