# 04: Separation contract with declared mapping and optional ICC provenance

Type: task
Status: done
Feature: halftone-engine
Spec ticket: 3 of 12
Spec: ../spec.md

**What to build:** Separation onto exactly the N ink channels the profile declares. v1 admits three
modes only: channel-preserving declared mapping, declared linear mixing with an explicit coefficient
matrix, and an ICC transform injected by the caller. Every transform carries a reproducible identity
and provenance, and every produced channel records which transform produced it. Implicit RGB-to-CMYK
or RGB-to-N conversion, undeclared mixing, invalid matrices and opaque transforms are rejected. A
`white` channel with data kind `mask` requires an explicit mask source; automatic DTF white
generation is absent.

**Blocked by:** 02 (shared contracts).

**Issue contract:** Emits only issues registered by the shared contract in 02; no module-local code
is introduced.

**Execution note:** May run in parallel with the other tickets blocked only by 02 when edit surfaces
are disjoint; otherwise sequential.

**Scope:**

- Channel-preserving mapping with optional per-channel transfer functions.
- Declared linear mixing with dimension and finiteness validation.
- Injected ICC transform with identity, version, profile hashes, rendering intent,
  black-point-compensation flag and parameter hash.
- Per-channel transform identity.
- White mask source validation.

**Out of scope:** colour science inside the engine, automatic RGB-to-CMYK, automatic white
generation, spot-colour rules and ICC profile parsing beyond the injected converter contract.

**Acceptance criteria:**

- [x] Separation produces exactly the N channels declared by the profile; a count or role mismatch is
      rejected; CMYK is not assumed.
- [x] Channel-preserving mapping produces one output channel per mapped input channel.
- [x] Declared linear mixing applies the matrix exactly as declared; wrong dimensions or non-finite
      coefficients are rejected.
- [x] Implicit RGB-to-CMYK or RGB-to-N conversion is rejected with a stable issue.
- [x] An ICC transform without a stable identity and the required provenance is rejected as
      `separation.unidentifiable_transform`.
- [x] Every produced channel records the identity of the transform that produced it.
- [x] A `white` channel with data kind `mask` without an explicit mask source is rejected; no
      automatic DTF white is generated.
- [x] Every issue emitted by this stage uses the shared contract from 02; no module-local code is
      introduced.
- [x] `npm run check` exits 0.

**Tests:**

- 1-, 4- and 8-channel profile fixtures; each yields exactly the declared channel set.
- Matrix cases: valid matrix, wrong dimensions and a non-finite coefficient.
- Provenance cases: complete descriptor accepted; missing identity, version or profile hash rejected;
  opaque transform rejected.
- Per-channel test: each channel reports the transform identity that produced it.
- White-mask test: present source accepted; absent source rejected.

## Comments

### Implementation (agent) — separation stage

**Status:** implemented, awaiting technical review.

**Files added**

- `src/engines/halftone/contracts/separation.ts` — separation modes, transform identity,
  channel-preserving and linear-mixing declarations, ICC provenance, mask sources, separated
  channel and stage result types.
- `src/engines/halftone/separation.ts` — `separate()`: declaration validation, mask-source
  validation, transform execution and 16-bit fixed-point quantisation.
- `tests/unit/halftone/separation-contract.test.ts` — 41 tests.

**Files changed**

- `src/engines/halftone/contracts/profile.ts` — optional `separation?: SeparationDeclaration` on
  `ProductionProfile`. The field is optional only so a mask-only profile is representable; a
  profile with tone channels and no declaration is rejected by the stage.
- `src/engines/halftone/contracts/issue.ts` — registered the separation-scope codes:
  `separation.invalid_input`, `separation.undeclared_mapping`, `separation.invalid_mapping`,
  `separation.channel_count_mismatch`, `separation.invalid_matrix`,
  `separation.invalid_transfer_function`, `separation.unidentifiable_transform`,
  `separation.invalid_transform_output`, `separation.mask_source_missing` and
  `separation.mask_source_invalid`.
- `src/engines/halftone/contracts/index.ts` — exports the new contract module.

**Decisions**

- Exactly three modes are admitted. A profile with tone channels and no declaration is rejected
  with `separation.undeclared_mapping`: the engine never derives RGB-to-CMYK or RGB-to-N.
- Channel-preserving separation requires an explicit input-to-ink map that is a bijection between
  input channels and tone channels. Fan-in (two inputs to one ink) is mixing without a declared
  matrix and is rejected; fan-out and missing or unknown entries are invalid mappings.
- Linear mixing declares one row per tone channel in profile order and one column per input
  channel. Every coefficient must be finite; a wrong row or column count is
  `separation.invalid_matrix`. The declared sum is clamped to `[0, 1]` before quantisation because
  16-bit fixed point cannot represent values outside the tonal range.
- The ICC declaration (identity and provenance) lives on the profile; the pure converter is
  injected separately. A missing declaration field, a non-SHA-256 hash, an unknown rendering
  intent or a missing converter is `separation.unidentifiable_transform`; a converter that throws
  or returns the wrong shape or out-of-range values is `separation.invalid_transform_output`.
- Transform identity carries a caller-supplied SHA-256 parameter hash. The engine validates its
  form (64 lowercase hexadecimal digits) and records it; it does not attest to the hash's truth.
- Tonal values are 16-bit unsigned fixed point: 8-bit samples expand exactly (`v * 257`), 16-bit
  samples are used directly, and every conversion uses `floor(x * 65535 + 0.5)`.
- Optional per-channel transfer functions apply to channel-preserving and linear-mixing modes,
  after the mapping and before quantisation. Linear interpolation clamps to the endpoint outputs.
  They carry their own registered code (`separation.invalid_transfer_function`) rather than
  reinterpreting the channel TRC codes owned by another stage.
- A mask channel requires an explicit `MaskSource`; coverage is `0..255` and scales exactly to
  the fixed-point range (`coverage * 257`). No white ink is generated. A mask-only profile is
  accepted without a separation declaration and records no transform.
- A rejection carries no channels, transforms or rasters by construction. `separation.invalid_input`
  guards the stage precondition: `separate()` consumes input that already passed the input gate.

**Verification**

- Focused suite `tests/unit/halftone/separation-contract.test.ts` — 41 passed.
- `npm run check` exit 0 — 201 passed, 4 skipped.
- `npm run build` exit 0 — bundle 30.9 kB.
- Prettier check and `git diff --check` clean.
- `tests/compatibility/architecture-boundary.test.ts` green; `separation.ts` imports only pure
  contract modules.
- The GGA gate runs on this commit through the pre-commit hook; no hook is bypassed.

### Review (agent, read-only) — verdict: CHANGES REQUIRED, corrected

An independent read-only technical review ran the focused suite and typecheck (both green) and
probed the stage in an isolated scratch copy. It raised one blocker and several minor/nit findings;
all candidate-caused items are corrected below.

**F1 — BLOCKER (fixed).** Duplicate channel ids silently corrupted output: `toneDataById` is keyed
by `channel.id`, so `channels: [a, a]` overwrote row 0 with row 1 in both linear-mixing and ICC
modes. Fixed by rejecting duplicate declared ids up front with `separation.channel_count_mismatch`
before any dispatch (`findDuplicateChannelIds`), covering the mask-source id map too. Regression test
added.

**F2 — MINOR (fixed).** `separate()` threw on structurally malformed stage input (non-array
`profile.channels`, non-iterable `maskSources`). Fixed with explicit `Array.isArray` guards returning
`rejected` with `separation.invalid_input`. Tests added.

**F3 — MINOR (fixed).** A zero-channel profile was accepted. Fixed: an empty `profile.channels` is
rejected with `separation.channel_count_mismatch`. Test added.

**F5 — NIT (fixed).** `HASH_ALGORITHMS`/`CANONICALISATION_VERSION` were exported but unused; the
validator now compares against those exported constants instead of hardcoding, and rejects an
unsupported canonicalisation version.

**F4 — MINOR (out of scope, documented).** A `white` role declared as `dataKind: 'tone'` is not
rejected by this stage. That rule (`channel.white_requires_mask`) is profile-contract-owned in
`validation.ts`; wiring profile validation before separation belongs to ticket 13. Separation only
enforces what its own declaration can mismatch.

**F6/F7 — ADVISORY (out of scope, pre-existing).** An empty `points: []` transfer function is
accepted by the shared `validateTrcControlPoints` precedent (pre-existing, not candidate-caused),
and the full-image intermediate is a memory concern owned by ticket 12. Neither is a ticket-04
acceptance criterion.

**Post-correction verification**

- Focused suite `tests/unit/halftone/separation-contract.test.ts` — 45 passed (was 41; +4
  regression tests for F1/F2/F3).
- `npx tsc --noEmit` exit 0.

### Integration evidence

- Implementation commit: `be572f3` (separation stage contract).
- Push: `ef92803..be572f3 master -> master` (fast-forward, no force push).
- Pull request: none. `master` has no branch protection and the repository declares no CI
  workflows, so ordinary repository policy integrates by direct push; no PR is required.
- CI: no GitHub Actions workflows exist in the repository. The mandatory local gates were run on
  the exact integrated commit: `npm run check` exit 0 (205 passed, 4 skipped), `npm run build`
  exit 0 (30.9 kB), Prettier clean, `git diff --check` clean, `gga run` PASS on `be572f3`.
- Remote verification: `git fetch origin`, then `origin/master` = `be572f3`; the commit count
  `origin/master..HEAD` is 0 and the working tree is clean.

Ticket 04 is `done`. Separation admits exactly the three declared modes; no implicit conversion was
introduced and no channel-set assumption (CMYK or otherwise) was baked into the engine.
