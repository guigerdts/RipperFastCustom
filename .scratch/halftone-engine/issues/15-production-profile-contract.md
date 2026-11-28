# 15: Production profile contract

Type: task
Status: done
Feature: halftone-engine
Spec ticket: 13 of 13
Spec: ../spec.md

**What to build:** The first version of the declarative production-profile contract and everything
needed to use it without a host: a versioned, immutable profile document, its validation with
specific diagnostics, schema versioning and migration, deterministic serialization, an explicit
adapter to the `assembleScreeningResult` request, and a persistence port with a file-backed
implementation plus a UXP file-system adapter. This is a contract and its plumbing, not the profile
UI: the professional three-level interface is the next ticket.

**Decision of record:** the first AM flow uses declarative production profiles. No form sends loose
parameters to the engine, and no physical preset is embedded in the engine or in fixtures.

**Blocked by:** 14 (engine audit closed and integrated).

**Scope:**

- Versioned profile document: identity, name, description, schema version, output DPI, per-channel
  AM screening (LPI, angle, dot shape), channels (ink name, data kind, display colour), declared
  separation, engine constraints, creation/modification metadata.
- Channels are ink channels, not a CMYK assumption: role names are free strings, so spot inks and
  custom separations are representable without a schema change.
- Separation modes `channel-preserving` and `linear-mixing`; `icc` is declared unsupported in schema
  v1 because it requires captured profile bytes.
- Validation with specific, unit-aware diagnostics, including the DPI/LPI cell relation.
- Deterministic serialization, parsing, schema-version gate and a migration chain (empty in v1).
- Explicit adapter from a profile plus a source input to the engine request, computing the
  separation identity hash through the engine's canonicalisation instead of accepting a user hash.
- Persistence port, in-memory repository, file-backed repository over an abstract file-system port,
  and a UXP adapter that feature-detects `getDataFolder()`.
- Contract documentation, the persistence strategy and the three-level UX outline.

**Out of scope:** the profile UI, reading or writing pixels, changes to the AM algorithm, changes to
engine contracts, the `localFileSystem` manifest permission and file dialogs, ICC separation,
physical presets, any new dependency.

**Acceptance criteria:**

- [x] The profile document is host-independent: nothing under `src/modules/` references Photoshop or
      UXP, and the profile validates without a host present.
- [x] No property is invented: every field maps to something the engine consumes, or is marked
      reserved and has no effect on the result.
- [x] Channels are declared ink channels; two channels with the same ink name are rejected.
- [x] DPI and LPI are separate fields with unit-specific diagnostics; a cell smaller than one output
      pixel is rejected and a declared `minimumCellPixels` that is not met is reported.
- [x] An unknown or newer `schemaVersion` is rejected with a specific diagnostic and never coerced.
- [x] Parsing and serialization round-trip without loss, and the serialized form is stable.
- [x] The adapter produces an engine request whose profile passes the engine's own
      `validateProfileContract`, and it reports those issues instead of throwing.
- [x] A separation identity hash is computed deterministically from the declared separation; no
      user-supplied hash is trusted.
- [x] Persistence is behind a port; the file-backed repository is tested with a fake file system and
      the UXP adapter reports `unavailable` when `getDataFolder()` is absent.
- [x] The persistence strategy states why `localStorage` is not the primary store.
- [x] `npm run check`, `npm run build`, `git diff --check` and GGA pass; no new dependency.

**Tests:**

- Validation: a valid profile, each invalid field, duplicate ink names, duplicate channel ids, the
  cell relation, unit-specific messages.
- Versioning: missing, unknown and newer schema versions; a migration chain that is empty in v1 and
  refuses to guess.
- Serialization: round-trip equality, stable key order, refusal of non-profile JSON.
- Adapter: channel preservation, linear mixing, engine contract issues surfaced, reserved-field
  absence.
- Persistence: create, read, update, duplicate, delete and list through the port; fake file system;
  UXP adapter unavailable without the storage module.

## Comments

Design notes and decisions taken while implementing this ticket are recorded in
`docs/production-profiles.md`.

## Completion

Delivered as listed in Scope. Verification at close:

- `npm run check` — 679 passed, 5 skipped (93 of them profile and adapter tests).
- `npm run build` — one 34.7 kB bundle, both staged packages produced.
- `git diff --check` — clean. GGA passed through the pre-commit hook on every commit.
- No new dependency, no change to the engine contracts or the AM algorithm.
- Photoshop itself is not available in this environment; the UXP adapter is proven
  against a fake module graph, not a live host.
