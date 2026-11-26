# 02: Shared halftone contracts: profile, channel, TRC, limits, issues

Type: task
Status: ready-for-human
Feature: halftone-engine
Spec ticket: 1 of 12
Spec: ../spec.md

**What to build:** The typed, pure contract layer every later slice compiles against: a production
profile with an extensible process discriminant and a screening method, an ink channel with role,
data kind and declared mapping, TRC control points and interpolation, reproduction limits, the shared
issue contract (stable code, severity, scope, structured context), and the request/outcome
envelopes. This is the prefactor that makes the vertical slices land green; it delivers no screening
behaviour.

**Shared issue contract:** Every module emits issues through one contract, never through
module-local codes:

- **Stable code** — a namespaced, machine-readable identifier whose meaning never changes; codes are
  registered in this contract and are not invented by callers or modules.
- **Severity** — exactly `error`, `warning` or `info`; an error rejects, a warning allows
  `completed`, and info is diagnostic.
- **Scope** — the stage that produced the issue: `input`, `profile`, `channel`, `geometry`,
  `separation`, `output` or `preview`.
- **Structured context** — a typed payload carrying the offending value, the expected constraint and
  the relevant identifiers (channel, parameter, profile field); a free-form message is never the only
  carrier of a diagnosis.
- **Consistent semantics** — the same condition yields the same code, severity and scope everywhere;
  a module never reinterprets another module's code.

Tickets 03–08 consume this contract and emit only the issues their stage owns. Ticket 09 consolidates
the full taxonomy, verifies coverage and defines emission and integration rules; it does not
duplicate the contract.

**Blocked by:** None (can start immediately).

**Scope:**

- Profile, channel, TRC, limit, issue, request and outcome types.
- A central code registry and issue factory; no module-local codes.
- Validation helpers for finite numbers, normalized `[0, 1]` values and strictly increasing TRC
  inputs.
- A stable type shape that later snapshot work can serialise.
- Pure modules only: no host, DOM, I/O, network or randomness.

**Out of scope:** separation algorithms, geometry, sampling, thresholding, snapshot serialisation,
warning integration and any physical preset.

**Acceptance criteria:**

- [ ] A minimal valid request is representable with profile, channel, TRC, limits and issue
      structures, with no `any` in public contracts.
- [ ] The process kind is an extensible discriminant; AM is one method; a missing required AM
      parameter is representable as an issue, never as a default.
- [ ] Channel role and data kind distinguish `tone` from `mask`, and `white` is a role rather than a
      special case.
- [ ] TRC control-point inputs must be strictly increasing and unique; limits require finite
      `[0, 1]` values with `a_wf < a_vf`.
- [ ] Every issue carries a stable code, a severity in `error | warning | info`, a scope and a
      structured context.
- [ ] The issue contract defines stable code, severity, scope, structured context and consistent
      semantics; no module-local code is representable.
- [ ] Error, warning and info semantics are fixed: an error rejects, a warning allows `completed`,
      and info is diagnostic.
- [ ] Codes are registered centrally; an unregistered code cannot be emitted.
- [ ] Tickets 03–08 can consume the contract without redefining it.
- [ ] No engine module references the host, DOM, filesystem, network or plugin storage.
- [ ] `npm run check` exits 0.

**Tests:**

- Contract test: a minimal valid request is accepted by the type-level seam; an invalid request is
  representable as a rejection with a stable code.
- Table-driven validation: duplicate, non-increasing and out-of-range TRC inputs are rejected;
  out-of-range and inverted limits are rejected.
- Issue-shape test: every severity and every scope is representable and distinguishable.
- Issue-contract test: every severity/scope combination is representable; an unregistered code is
  rejected.
- Semantics test: an error yields `rejected`, a warning yields `completed`, and info does not change
  the outcome.
- Structured-context test: a diagnosis carries the offending value, the expected constraint and the
  relevant identifiers.
- Boundary test: the existing architecture-boundary check still passes with the new modules.

## Comments

### Implementation (agent) — contracts layer

**Status:** implemented, awaiting human review. No screening behaviour is delivered here; this is the
typed contract layer tickets 03–08 compile against.

**Files added**

- `src/engines/halftone/contracts/issue.ts` — `IssueSeverity`, `IssueScope`, `JsonValue`,
  `IssueContext`, `IssueDefinition`, central `ISSUE_REGISTRY`, `IssueCode`, `Issue`,
  `isRegisteredIssueCode`, `createIssue`, `resolveOutcomeStatus`.
- `src/engines/halftone/contracts/tonal.ts` — `NormalizedValue`, `TrcControlPoint`,
  `TrcInterpolation`, `ToneReproductionCurve`, `ReproductionLimits`.
- `src/engines/halftone/contracts/screening.ts` — `ScreeningMethod`, `DotShape`, `DOT_SHAPES`,
  `AmScreeningConfiguration`, `UnsupportedScreeningConfiguration`, `ScreeningConfiguration`.
- `src/engines/halftone/contracts/profile.ts` — `KNOWN_PROCESS_KINDS`, `ProcessKind`, `ChannelRole`,
  `WHITE_ROLE`, `ChannelDataKind`, `InkChannel`, `ProductionProfile`.
- `src/engines/halftone/contracts/request.ts` — `ContinuousToneInput`, `OutputSettings`,
  `ScreeningRequest`, `OutcomeStatus`, `CompletedOutcome`/`RejectedOutcome`/`CancelledOutcome`,
  `ScreeningOutcome`.
- `src/engines/halftone/contracts/validation.ts` — `isFiniteNumber`, `isNormalizedValue`,
  `validateTrcControlPoints`, `validateReproductionLimits`, `validateScreeningConfiguration`,
  `validateChannelContract`, `validateProfileContract`.
- `src/engines/halftone/contracts/index.ts` — barrel export.

**Tests added**

- `tests/unit/halftone/issue-contract.test.ts` (8) — registry-derived severity/scope, all severities,
  all seven scopes, unregistered-code rejection, structured context, and fixed outcome semantics
  (error → `rejected`, warning/info → `completed`).
- `tests/unit/halftone/validation.test.ts` (23) — TRC strictly-increasing/unique/range/non-monotonic
  info; limits range/order/finite; AM missing/invalid parameters and unsupported method; white as a
  role; duplicate-angle warning; absent-limits identity warning; minimal valid request envelope.

**Decisions**

- Severity and scope live in `ISSUE_REGISTRY`; `createIssue` throws for an unregistered code, so a
  module cannot emit a code it did not declare centrally.
- Registry seeds only the codes the contract-level validators already emit. The full taxonomy is
  ticket 09; this layer does not pre-empt it.
- Non-monotonic TRC output is informational only and never rejects the run.
- Absent limits are an explicit `channel.limits_identity` warning, not a silent default.
- Separation, geometry, sampling, thresholding, snapshot serialisation and warning integration are
  intentionally absent (out of scope).

**Verification**

- `npm run check` exit 0 — 97 passed, 4 skipped (integration suite skipped as before).
- `npm run build` exit 0 — bundle 30.9 kB.
- `tests/compatibility/architecture-boundary.test.ts` still green: no engine module references host,
  DOM, filesystem, network or plugin storage.

### Corrections (independent review)

Applied on top of `0feb0cf` in a separate commit; the original commit is unchanged.

- **H1 — independent TRC validation.** `validateTrcControlPoints` now validates input range, output
  range and input ordering independently. An invalid output no longer short-circuits the loop, so a
  duplicate or disordered input after a `NaN`/`Infinity` output is still reported. Out-of-range
  input and output are separate issues distinguished by `parameter` (`trc.points[].input` /
  `trc.points[].output`). Tests: duplicate after `NaN` output, disordered after `Infinity` output,
  and two independent diagnostics from one invalid point.
- **H2 — deterministic `IssueContext` serialisation.** Added `toJsonValue` and made `createIssue`
  normalise every context field. `NaN`, `Infinity` and `-Infinity` are preserved as `"NaN"`,
  `"Infinity"` and `"-Infinity"` instead of collapsing to `null`. Removed the `as JsonValue` casts
  on `unknown` AM parameters in favour of explicit normalisation. Tests: real
  `JSON.stringify`/`JSON.parse` round-trip of non-finite context, finite context unchanged, and a
  non-finite offending limit serialised as diagnostic text.
- **H3 — no arbitrary process-attribute bag.** Replaced
  `processAttributes?: Readonly<Record<string, JsonValue>>` with a typed slot
  `ProductionProfile<TProcessAttributes = never>`. The shared base carries no attributes; a concrete
  process profile parameterises its own attribute interface, so the extensible `processKind`
  discriminant is preserved and validation is by type. `ScreeningRequest` and the profile validators
  are generic over the same slot. No physical attributes were introduced. Cross-checked against spec
  §4 (line 298), `DOMAIN-MODEL.md` R5, ADR-0005, ADR-0006 and `GLOSSARY.md`.
- **H4 — white role coherence.** Added `channel.white_requires_mask` (error, scope `channel`):
  a `white` role must carry `dataKind: 'mask'`. No restriction is imposed on other roles. Tests:
  white+tone rejected, white+mask accepted, non-white mask allowed.

**Verification:** `npm run check` exit 0 — 107 passed, 4 skipped; `npm run build` exit 0 — bundle
30.9 kB; `architecture-boundary.test.ts` green.
