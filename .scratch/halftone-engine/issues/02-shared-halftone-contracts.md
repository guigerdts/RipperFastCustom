# 02: Shared halftone contracts: profile, channel, TRC, limits, issues

Type: task
Status: ready-for-agent
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
