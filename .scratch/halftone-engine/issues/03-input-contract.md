# 03: Input contract and prepared-artwork detection

Type: task
Status: ready-for-human
Feature: halftone-engine
Spec ticket: 2 of 12
Spec: ../spec.md

**What to build:** The input gate of the public seam. Continuous-tone RGB or grayscale 8/16-bit
input with explicit PPI is accepted and passed to the next stage. Missing PPI, unsupported bit depth
or layout, and binary, pre-separated or pre-screened input are rejected with stable issue codes. An
explicit prepared-artwork override is accepted only with an acknowledgment that is recorded and
warned. The engine never invents a file resolution or silently converts an input layout.

**Blocked by:** 02 (shared contracts).

**Issue contract:** Emits only issues registered by the shared contract in 02; no module-local code
is introduced.

**Execution note:** May run in parallel with the other tickets blocked only by 02 when edit surfaces
are disjoint; otherwise sequential.

**Scope:**

- Input validation for continuous-tone RGB/gray, 8- and 16-bit, explicit PPI.
- Prepared-artwork detection signals and the explicit override path.
- Stable issue codes and scopes for every rejection.
- A rejection carries no rasters.

**Out of scope:** separation, tonal processing, geometry, screening and any automatic resampling or
colour conversion.

**Acceptance criteria:**

- [x] A continuous-tone RGB or grayscale 8/16-bit input with explicit PPI is accepted.
- [x] A missing PPI is rejected with a stable `input.ppi_missing` issue.
- [x] An unsupported bit depth or channel layout is rejected with a stable issue.
- [x] A binary, pre-separated or pre-screened input is rejected with a prepared-artwork issue.
- [x] An override without an explicit acknowledgment is rejected; with an acknowledgment and a
      non-empty reason it is recorded for the snapshot and produces a warning.
- [x] A rejected outcome contains no rasters.
- [x] Every issue emitted by this stage uses the shared contract from 02; no module-local code is
      introduced.
- [x] `npm run check` exits 0.

**Tests:**

- Table-driven input fixtures: RGB 8-bit, RGB 16-bit, grayscale 8-bit, grayscale 16-bit and an
  unsupported layout.
- Prepared-artwork fixtures: one per detection signal; each rejects with the prepared-artwork code.
- Override tests: absent acknowledgment rejects; a blank or whitespace-only reason rejects with a
  stable issue and records nothing; a present acknowledgment with a non-empty reason completes with
  a warning and a recorded override.
- 16-bit tonal-distribution test: a buffer that uses both extremes and no intermediate sample is
  detected; one with intermediate samples is not.
- Rejection test: no raster is allocated or returned.

## Comments

### Implementation (agent) — input gate

**Status:** implemented, awaiting human review.

**Files added**

- `src/engines/halftone/input.ts` — `validateInputContract`, `InputGateResult`,
  `AcceptedInput`, `RejectedInput`, `PreparedArtworkSignal`, `PreparedArtworkOverrideRecord`,
  `SUPPORTED_BIT_DEPTHS`, `SUPPORTED_LAYOUTS`, `PREPARED_ARTWORK_LAYOUTS`.
- `tests/unit/halftone/input-contract.test.ts` — 53 tests.

**Files changed**

- `src/engines/halftone/contracts/request.ts` — added `PreparedArtworkOverride` and the optional
  `preparedArtworkOverride` field on `ContinuousToneInput`; the interface documents that an
  acknowledgment requires a non-empty reason.
- `src/engines/halftone/contracts/issue.ts` — registered the input-scope codes:
  `input.invalid_dimensions`, `input.ppi_missing`, `input.invalid_ppi`,
  `input.unsupported_bit_depth`, `input.unsupported_layout`, `input.data_size_mismatch`,
  `input.prepared_artwork` (error), `input.prepared_artwork_override` (warning) and
  `input.prepared_artwork_override_reason_missing` (error).

**Decisions**

- The gate is a pure stage function, not the public screening entry. It returns `accepted` with
  issues and recorded overrides, or `rejected` with issues only; the rejected branch has no
  raster, snapshot or stage field, so a rejection cannot carry image output by construction.
- Prepared-artwork detection uses the four declared signals from spec §2: source-kind, bit depth,
  layout and a documented tonal-distribution check. The distribution check flags a buffer that
  contains both extremes of its bit depth and no intermediate value; a uniform solid image is not
  flagged.
- Structural signals (`bit-depth`, `layout`) describe material the engine cannot represent as
  continuous tone. They are always errors and cannot be overridden. Declarative and heuristic
  signals (`source-kind`, `tonal-distribution`) are errors without an acknowledgment and a warning
  plus a recorded override with `acknowledged: true`.
- An acknowledged override must carry a non-empty reason. A blank or whitespace-only reason is
  rejected with `input.prepared_artwork_override_reason_missing` and is never recorded, because the
  snapshot would otherwise preserve an empty audit trail.
- The override record is returned for ticket 08 to embed in the snapshot; no snapshot is built
  here.
- Data buffers must match the declared depth and the dimensions × layout sample count; a mismatch
  is `input.data_size_mismatch` rather than a silent truncation or reinterpretation.
- Codes are registered in the shared contract, never module-local. `input.low_resolution` remains
  ticket 09 because it needs a profile-declared threshold.

**Verification**

- Focused suite `tests/unit/halftone/input-contract.test.ts` — 53 passed.
- `npm run check` exit 0 — 160 passed, 4 skipped.
- `npm run build` exit 0 — bundle 30.9 kB.
- Prettier check and `git diff --check` clean.
- `tests/compatibility/architecture-boundary.test.ts` green; `input.ts` imports only the pure
  contract modules.
- `gga run` PASS on the staged change.

### Corrections after technical review (M1, M3)

**Status:** corrections applied, awaiting integration.

- **M1 — required reason.** An acknowledged override with an empty or whitespace-only reason is now
  rejected with the new registered code `input.prepared_artwork_override_reason_missing`; the
  override is not recorded. Tests cover `''`, `'   '`, a tab-and-newline reason, a valid reason, and
  `acknowledged: false` with a blank reason.
- **M3 — 16-bit tonal distribution.** Tests now exercise `MAX_SAMPLE_BY_BIT_DEPTH[16]` with samples
  `0` and `65535`, confirm that intermediate samples are not flagged, confirm that a uniform
  16-bit image is not flagged, and confirm that an acknowledged override of the 16-bit
  tonal-distribution signal is accepted with a warning and a recorded override.
- No threshold, detection rule or override semantics changed.
