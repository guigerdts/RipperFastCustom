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

- [ ] The four stages are observable through the trace; identity TRC and identity limits are recorded
      as stages, not skipped.
- [ ] The TRC is deterministic; control points are preserved; duplicate or non-increasing inputs are
      rejected as ambiguous.
- [ ] Non-monotonic TRC output produces an informational diagnostic, not a rejection.
- [ ] Limits are applied after the TRC: `a_corrected <= a_wf` gives 0, `a_corrected >= a_vf` gives 1,
      and the interval is interpolated linearly.
- [ ] `a_wf` and `a_vf` are normalized to `[0, 1]` with `a_wf < a_vf`; invalid or inverted ranges are
      rejected.
- [ ] `a_commanded` and `a_corrected` are preserved; `a_reproducible` is an independent stage.
- [ ] Absent limits use identity and produce an informational warning.
- [ ] Every issue emitted by this stage uses the shared contract from 02; no module-local code is
      introduced.
- [ ] `npm run check` exits 0.

**Tests:**

- Table-driven TRC cases: linear, stepped and identity curves; duplicate and non-increasing inputs.
- Limit boundary cases: exactly `a_wf`, exactly `a_vf`, just inside and just outside.
- Stage-trace test: all four values are present for an identity configuration.
- Preservation test: commanded and corrected values are unchanged by the limit stage.
- Invalid-limit test: out-of-range and inverted ranges reject with a stable code.
