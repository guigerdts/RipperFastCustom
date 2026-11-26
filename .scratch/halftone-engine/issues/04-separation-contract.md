# 04: Separation contract with declared mapping and optional ICC provenance

Type: task
Status: ready-for-agent
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

- [ ] Separation produces exactly the N channels declared by the profile; a count or role mismatch is
      rejected; CMYK is not assumed.
- [ ] Channel-preserving mapping produces one output channel per mapped input channel.
- [ ] Declared linear mixing applies the matrix exactly as declared; wrong dimensions or non-finite
      coefficients are rejected.
- [ ] Implicit RGB-to-CMYK or RGB-to-N conversion is rejected with a stable issue.
- [ ] An ICC transform without a stable identity and the required provenance is rejected as
      `separation.unidentifiable_transform`.
- [ ] Every produced channel records the identity of the transform that produced it.
- [ ] A `white` channel with data kind `mask` without an explicit mask source is rejected; no
      automatic DTF white is generated.
- [ ] Every issue emitted by this stage uses the shared contract from 02; no module-local code is
      introduced.
- [ ] `npm run check` exits 0.

**Tests:**

- 1-, 4- and 8-channel profile fixtures; each yields exactly the declared channel set.
- Matrix cases: valid matrix, wrong dimensions and a non-finite coefficient.
- Provenance cases: complete descriptor accepted; missing identity, version or profile hash rejected;
  opaque transform rejected.
- Per-channel test: each channel reports the transform identity that produced it.
- White-mask test: present source accepted; absent source rejected.
