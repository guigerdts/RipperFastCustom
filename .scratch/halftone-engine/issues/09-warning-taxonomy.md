# 09: Warning taxonomy and integrated validation

Type: task
Status: done
Feature: halftone-engine
Spec ticket: 8 of 12
Spec: ../spec.md

**What to build:** One stable warning and error taxonomy integrated across every stage. Errors
produce `rejected`; warnings allow `completed`; informational issues are diagnostic. Every issue
carries the shared contract's code, severity, scope and structured context. Every combination the
engine cannot prove valid produces at least one warning. The input low-resolution warning is emitted
only from a profile-declared threshold and is kept distinct from the output DPI/LPI addressability
check.

**Blocked by:** 02 (contracts), 03 (input), 04 (separation), 05 (tonal chain), 06 (geometry),
07 (sampling and thresholding), 08 (result and snapshot).

**Issue contract:** Consolidates the shared contract defined in 02. Verifies coverage against the
spec's full error and warning list, defines emission and integration rules, and rejects any
module-local code. It does not redefine the contract.

**Execution note:** May run in parallel with 10–12 when edit surfaces are disjoint; otherwise
sequential.

**Scope:**

- Stable code registry for every error and warning in the spec.
- Severity and scope assignment.
- Integrated validation across input, profile, separation, tonal chain, geometry, output and
  preview.
- The no-silent-pass rule.
- Input-sampling threshold semantics.

**Out of scope:** preview implementation, cancellation, performance benchmarking and any new
screening behaviour.

**Acceptance criteria:**

- [x] Every error and warning code listed in the spec is emitted by its intended condition and
      asserted by a test.
- [x] Insufficient output addressability, duplicate channel angles, an input sampling ratio below
      the profile-declared minimum, and a declared mesh without a validated relation each produce
      the specified warning.
- [x] The input low-resolution warning is emitted only when the profile declares a minimum input
      samples per screen line; no universal PPI/LPI threshold is applied; the computed ratio and the
      declared threshold are recorded.
- [x] The input-sampling warning is distinct from the output DPI/LPI addressability check.
- [x] A non-AM method is rejected as unsupported; a missing AM parameter is rejected; no physical
      default is substituted.
- [x] Any unvalidated parameter combination produces at least one warning.
- [x] No ticket or module defines a code outside the shared contract; coverage of the spec's error
      and warning list is verified.
- [x] Emission and integration rules are defined and tested across stages.
- [x] `npm run check` exits 0.

> Note on the first box: two registry entries are reserved vocabulary, not yet emitted.
> `preview.requested` belongs to the preview mode (ticket 10, explicitly out of scope here) and
> `geometry.clipped_trace` to the trace API, which does not exist yet. Every other code in the
> spec's error and warning list is emitted by its condition and asserted by a test.
>
> Note on the last box: `npm run check` cannot complete in this environment — its parallel file
> workers abort on `uv__io_poll`/`futex`. The four steps the script runs were executed sequentially
> instead (`tsc --noEmit`, `eslint .`, `prettier --check .`, `vitest run --no-file-parallelism`);
> all four pass. The failure is environmental, not a code defect.

**Tests:**

- Code-table test: one fixture per error and per warning; assert code, severity and scope.
- No-silent-pass test: a table of unusual-but-valid combinations; each yields at least one warning
  or a documented valid result.
- Threshold test: profile without a minimum emits no low-resolution warning; profile with a minimum
  emits it only below the threshold and records the ratio and threshold.
- Separation of checks: a low input ratio does not trigger the output addressability warning, and
  vice versa.

## Implementation record

- **Registry.** `ISSUE_REGISTRY` gains `input.low_resolution` (warning, input),
  `geometry.duplicate_angle` (warning, geometry), `geometry.insufficient_addressability` (warning,
  geometry), `profile.mesh_unvalidated` (warning, profile), `profile.invalid_constraint` (error,
  profile), `output.unsupported_resolution` (error, output) and the reserved
  `geometry.clipped_trace` / `preview.requested`. `profile.duplicate_channel_angles` was removed;
  the duplicate-angle warning now lives in the geometry scope, matching spec §8's wording.
- **Identity and order.** `issueIdentity` hashes code, scope, message and canonicalised context;
  `dedupeIssues` keeps the first of each identity; `sortIssues` orders by scope rank, code,
  channel, message and context; `finalizeIssues` composes both.
- **Validation module.** `validateProfileConstraints` rejects unusable declared thresholds and
  allowed-resolution lists; `validateMeshDeclaration` warns on any declared mesh because v1 has no
  mesh-to-LPI relation; `validateOutputResolution` enforces the declared allowed resolutions;
  `validateSamplingRatios` computes the two independent comparisons per AM channel.
- **Integration.** `validateScreeningRequest` runs after the input gate and before separation; an
  error rejects, a warning travels with the run. `assembleScreeningResult` wraps the whole pipeline
  in `finalizeEnvelope`, so `completed`, `rejected` and `cancelled` envelopes all carry a
  deduplicated, ordered diagnostic list.
- **Threshold semantics.** `ProductionProfile.minimumInputSamplesPerScreenLine` is optional. When
  absent, no `input.low_resolution` is ever emitted. When present, each AM channel compares
  `input PPI / LPI` against it and records `ppi`, `lpi`, the computed ratio and the declared
  minimum. The check never reads `minimumCellPixels`, and the addressability check never reads the
  input threshold.
- **Snapshot.** `SnapshotInput` records `minimumInputSamplesPerScreenLine` next to the existing
  `minimumCellPixels`, keeping the record self-contained.
- **Commits.** `76a0f1b` (taxonomy and profile validation), `8054280` (pipeline integration and
  envelope finalisation), `2930fe8` (taxonomy test suite).

## Verification

- **Focused suites:** `warning-taxonomy.test.ts` 40 tests, `issue-finalization.test.ts` 7,
  `validation.test.ts` 31, `result.test.ts` 22 — all pass.
- **Full suite:** `npx vitest run --no-file-parallelism` — 403 passed, 4 skipped (21 files passed,
  1 integration file skipped).
- **Typecheck, lint, format:** `tsc --noEmit`, `eslint .`, `prettier --check .` — all clean.
- **Build:** `npm run build` — clean, bundle 30.9 kB.
- **Whitespace:** `git diff --check` — clean.
- **Golden evidence:** adding the snapshot field moves the pinned fixture to
  `e37cde12dd156a1989a209361eac385be59f7afb90532273bb0982797f84967d` with a 2464-character canonical
  record, and the pin was updated with the new bytes rather than relaxed.
- **Repository state:** `master == origin/master == 2930fe8`, working tree clean.

## Review and corrections

- **GGA pre-commit (`opencode:google/gemini-3.5-flash-lite`, STRICT_MODE):** STATUS: PASSED on each
  of the three commits.
- **Review failure on the third slice — partly false, partly real.** The first attempt reported the
  taxonomy table as desynchronised and claimed `npm run check` showed failures. Re-verified before
  acting: `tsc` was clean and the 38 tests passed, so the failure claim was wrong; the table gap was
  real. `profile.unsupported_method` and `profile.missing_am_parameter` were exercised by the file
  but missing from the table, so both entries were added (40 tests). The re-review returned
  STATUS: PASSED.
- **Independent verifier unavailable.** The `gentle-ai-verify` subagent is permission-denied in this
  runtime, so no independent per-requirement verdict was produced. Substitute evidence: an
  integrated `gga run --no-cache` over the complete nine-file change, staged in a throwaway worktree,
  returned STATUS: PASSED. This is an external review of the whole change, not an independent
  requirement-by-requirement audit.
- **Reserved vocabulary, not silently claimed.** `preview.requested` and `geometry.clipped_trace` are
  registered with their severities and scopes and documented in the registry comment. Neither can be
  emitted by this ticket: preview is ticket 10 and the trace API does not exist. Their emission
  belongs to the tickets that build those paths.
