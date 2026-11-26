# 05: Tonal chain: TRC, reproduction limits and four-stage trace

Type: task
Status: ready-for-agent
Feature: halftone-engine
Spec ticket: 4 of 12
Spec: ../spec.md

**What to build:** The observable four-stage tonal chain: `a_commanded` from separation,
`a_corrected` after the channel TRC, `a_reproducible` after the reproduction limits, and the
screening result. Identity TRC and identity limits are recorded as stages, never skipped. The TRC is
deterministic 16-bit fixed-point with linear interpolation and preserved control points. Limits use
the approved linear remap between `a_wf` and `a_vf` with clamping at both ends. The trace exposes all
four values per cell or region.

**Blocked by:** 02 (shared contracts).

**Issue contract:** Emits only issues registered by the shared contract in 02; no module-local code
is introduced.

**Execution note:** May run in parallel with the other tickets blocked only by 02 when edit surfaces
are disjoint; otherwise sequential.

**Scope:**

- TRC evaluation and control-point preservation.
- Reproduction-limit remap and validation.
- Stage trace per cell and per rectangular region.
- Identity stages recorded explicitly.
- Invalid TRC and invalid limits rejected.

**Out of scope:** calibration data, enforced TRC output monotonicity, screening geometry and
rasterization.

**Acceptance criteria:**

- [x] The four stages are observable through the trace; identity TRC and identity limits are recorded
      as stages, not skipped.
- [x] The TRC is deterministic; control points are preserved; duplicate or non-increasing inputs are
      rejected as ambiguous.
- [x] Non-monotonic TRC output produces an informational diagnostic, not a rejection.
- [x] Limits are applied after the TRC: `a_corrected <= a_wf` gives 0, `a_corrected >= a_vf` gives 1,
      and the interval is interpolated linearly.
- [x] `a_wf` and `a_vf` are normalized to `[0, 1]` with `a_wf < a_vf`; invalid or inverted ranges are
      rejected.
- [x] `a_commanded` and `a_corrected` are preserved; `a_reproducible` is an independent stage.
- [x] Absent limits use identity and produce an informational warning.
- [x] Every issue emitted by this stage uses the shared contract from 02; no module-local code is
      introduced.
- [x] `npm run check` exits 0.

**Tests:**

- Table-driven TRC cases: linear, stepped and identity curves; duplicate and non-increasing inputs.
- Limit boundary cases: exactly `a_wf`, exactly `a_vf`, just inside and just outside.
- Stage-trace test: all four values are present for an identity configuration.
- Preservation test: commanded and corrected values are unchanged by the limit stage.
- Invalid-limit test: out-of-range and inverted ranges reject with a stable code.

## Implementation

**Module:** `src/engines/halftone/tonal.ts` (pure, synchronous; no host, DOM, I/O, network or
randomness). `applyTonalChain(stage)` returns an accepted result with every channel carrying all
three computed stages plus the effective TRC/limits, or a rejection with no channel data.
`traceTonalChain(channel, request, options)` produces the per-sample four-stage trace.

**Types:** `src/engines/halftone/contracts/tonal.ts` gained `TonalChannelInput`,
`TonalChannelResult`, `TonalStageSummary`, `AcceptedTonalChain` / `RejectedTonalChain` /
`TonalChainResult`, `TonalTraceEntry`, `TonalTrace`, `TonalTraceRegion`, `TonalTraceRequest` and
`TonalTraceOptions`. `TonalTraceEntry.screeningResult` is `NormalizedValue | null`: the slot is
always present, `null` until the screening stage fills it. This resolves the ticket's trace-scoping
tension without simulating screening behaviour (owned by tickets 06/07).

**Registered code:** one new central code `channel.tonal_input_invalid` (severity `error`, scope
`channel`) in `src/engines/halftone/contracts/issue.ts` for the structural guard (non-list channel
set, non-`Uint16Array` commanded stage, empty channel). Every other issue reuses the shared
validators: `validateTrcControlPoints` (`channel.trc_ambiguous` / `channel.trc_out_of_range` /
`channel.trc_non_monotonic`) and `validateReproductionLimits` (`channel.limits_invalid`), plus
`channel.limits_identity` when no limits are declared. No module-local code is introduced.

**Decisions:**

- Tonal values are 16-bit unsigned fixed-point; every conversion uses one `floor(x*65535+0.5)`
  rule, matching the separation stage's `toFixedPoint`.
- TRC evaluation is linear interpolation, clamping outside the control-point domain to endpoint
  outputs; an empty point list is an explicit identity curve. Control points are preserved verbatim
  in the result.
- Limit remap is the spec's float formula `(a_corrected - a_wf)/(a_vf - a_wf)` with clamping at
  `<= a_wf` → 0 and `>= a_vf` → 1, then a single round-half-up to fixed point. The exact float
  midpoint is not assumed to be representable; tests assert the deterministic adjacent value.
- `a_commanded` is preserved verbatim (same `Uint16Array`), `a_corrected` and `a_reproducible` are
  independent arrays, never aliases.
- Absent TRC records identity without a warning; absent limits record identity **and** emit the
  informational `channel.limits_identity` warning.
- `traceTonalChain` skips out-of-range/non-integer sample indices; a region requires a positive
  `stride` and expands row-major. `screeningResultAt` is the seam ticket 07 fills.

**Verification:**

- Focused: `tests/unit/halftone/tonal-chain.test.ts` — 23 tests pass.
- `npm run check` — exit 0 (typecheck + lint + format:check + 228 passed, 4 skipped).
- `npm run build` — clean, bundle 30.9 kB.
- `git diff --check` — clean.

**Review and corrections:**

- **GGA (`gga run`, opencode provider, STRICT_MODE):** first pass FAILED on a real issue — the appended ticket doc had a trailing blank line that `format:check` rejected. Fixed with `prettier --write`; second pass **STATUS: PASSED** (exit 0). GGA also noted the `applyLimits` `span <= 0` branch as harmless unreachable code.
- **Independent AI technical review** (`opencode run --agent gentle-ai-verify`, read-only): **VERDICT: APPROVED**, no blockers, 2 warnings, 5 suggestions. Applied corrections:
  - WARNING 1 — `null` TRC / `null` limits / `null` control point would throw a `TypeError` instead of a typed rejection. Guarded with `asRecord` before delegating to the shared validators; each now rejects with `channel.tonal_input_invalid`. Added tests.
  - WARNING 2 — the rejected `commanded` container was expanded verbatim in `offendingValue`, an O(samples) allocation on the rejection path. Replaced with a bounded `describeContainer` summary (`{ kind, length }`).
  - SUGGESTION 5 — recorded `trc`/`limits` were the caller's object references and the identity constants were mutable. Identity constants are now frozen; the result records a `copyTrc` snapshot and a fresh limits object, so later mutation of the caller's input cannot change how the run is interpreted (§5/§9). Added a mutation test.
  - SUGGESTION 6 — added tests for endpoint clamp outside the control-point domain, out-of-range/non-integer trace index skipping, and limits applied after a non-identity TRC.
  - Deferred (documented, out of ticket 05 scope): region `stride` validation returns an empty trace by design (ticket documents "positive stride"); `trc.interpolation` validation belongs to the shared vocabulary owner (ticket 02/09); an empty channel list is accepted (separation does not produce one). The `span <= 0` branch is retained as harmless defence-in-depth.
- Re-verification after corrections: focused suite 29 tests pass; `npm run check` exit 0 (234 passed, 4 skipped); build 30.9 kB; `git diff --check` clean.
