# 09: Warning taxonomy and integrated validation

Type: task
Status: ready-for-agent
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

- [ ] Every error and warning code listed in the spec is emitted by its intended condition and
      asserted by a test.
- [ ] Insufficient output addressability, duplicate channel angles, an input sampling ratio below
      the profile-declared minimum, and a declared mesh without a validated relation each produce
      the specified warning.
- [ ] The input low-resolution warning is emitted only when the profile declares a minimum input
      samples per screen line; no universal PPI/LPI threshold is applied; the computed ratio and the
      declared threshold are recorded.
- [ ] The input-sampling warning is distinct from the output DPI/LPI addressability check.
- [ ] A non-AM method is rejected as unsupported; a missing AM parameter is rejected; no physical
      default is substituted.
- [ ] Any unvalidated parameter combination produces at least one warning.
- [ ] No ticket or module defines a code outside the shared contract; coverage of the spec's error
      and warning list is verified.
- [ ] Emission and integration rules are defined and tested across stages.
- [ ] `npm run check` exits 0.

**Tests:**

- Code-table test: one fixture per error and per warning; assert code, severity and scope.
- No-silent-pass test: a table of unusual-but-valid combinations; each yields at least one warning
  or a documented valid result.
- Threshold test: profile without a minimum emits no low-resolution warning; profile with a minimum
  emits it only below the threshold and records the ratio and threshold.
- Separation of checks: a low input ratio does not trigger the output addressability warning, and
  vice versa.
