# 08: Result assembly, self-contained snapshot and reproducibility

Type: task
Status: done
Feature: halftone-engine
Spec ticket: 7 of 12
Spec: ../spec.md

**What to build:** The completed result: one binary raster per ink channel plus an immutable,
self-contained snapshot. The snapshot embeds every effective parameter value, not only hashes:
role mapping, transfer functions, matrix coefficients, TRC points, limits, lattice and boundary
conventions, and the addressability distinction. Canonicalisation is versioned, key-sorted, UTF-8,
locale-free and timestamp-free, with an exact numeric encoding and SHA-256. An ICC transform embeds
its profile bytes or a content-addressed immutable artifact verified by hash. Given the snapshot and
the same input bytes, every parameter is reconstructable without the editable profile or any mutable
external file. Whole-image and tiled runs are byte-identical.

**Blocked by:** 03 (input), 04 (separation), 05 (tonal chain), 06 (geometry), 07 (sampling and
thresholding).

**Issue contract:** Emits only issues registered by the shared contract in 02; no module-local code
is introduced.

**Scope:**

- Result envelope for `completed`, `rejected` and `cancelled`.
- Per-channel rasters and metadata.
- Self-contained snapshot with effective values and separation provenance.
- Versioned canonicalisation, exact numeric encoding and SHA-256.
- ICC profile bytes or content-addressed immutable artifact with hash verification.
- Snapshot immutability and reconstruction.
- Whole-image versus tiled byte identity.

**Out of scope:** preview, cancellation implementation, benchmark harness, UI or export wiring.

**Acceptance criteria:**

- [x] A completed result contains one binary raster per channel at the output DPI plus the snapshot;
      a rejected result contains no rasters; a cancelled result contains no rasters and no snapshot.
- [x] The snapshot embeds effective parameter values, not only hashes: role mapping, transfer
      functions, matrix coefficients, TRC points, limits, lattice and boundary conventions, and the
      addressability distinction.
- [x] The snapshot excludes timestamps, paths and host identifiers, and is immutable against later
      profile or request mutations.
- [x] Canonicalisation is versioned, key-sorted, UTF-8, locale-free and timestamp-free; numbers use
      the exact IEEE-754 binary64 encoding and binary payloads use base64 (see the injectivity note
      below).
- [x] The same effective parameters produce the same canonical bytes and hash; a golden test pins
      one byte sequence and its SHA-256.
- [x] An ICC transform embeds its profile bytes or a content-addressed immutable artifact verified by
      hash; when the bytes cannot be captured the run is rejected as
      `separation.unreproducible_transform`.
- [x] Given the snapshot and the same input bytes, every effective parameter and the separation
      provenance are reconstructable without the editable profile and without any mutable external
      file; re-running produces identical output in the declared numeric environment.
- [x] Whole-image and tiled processing produce byte-identical rasters, stage summaries and snapshots
      when the tile union covers the canvas.
- [x] Every issue emitted by this stage uses the shared contract from 02; no module-local code is
      introduced.
- [x] `npm run check` exits 0.

**Tests:**

- Result-shape tests for `completed`, `rejected` and `cancelled`.
- Snapshot golden test: one canonical byte sequence and its SHA-256.
- Mutation test: edit or remove the profile after a run; the snapshot, its interpretation and a
  re-run are unchanged.
- Reconstruction test: snapshot plus input bytes reproduce every parameter and the same output.
- ICC test: embedded bytes accepted; missing bytes rejected with
  `separation.unreproducible_transform`; hash mismatch rejected.
- Tiled test: whole-image and tiled runs are byte-identical.

## Implementation record

**Modules.** `src/engines/halftone/contracts/result.ts` (envelope, raster, per-channel metadata,
snapshot shapes, tile), `src/engines/halftone/snapshot.ts` (canonical conversion, sealing,
verification, embedded-profile verification) and `src/engines/halftone/result.ts` (pipeline
assembly). `contracts/issue.ts` gains `separation.unreproducible_transform` and
`output.snapshot_invalid`; `contracts/separation.ts` gains optional ICC profile bytes;
`contracts/index.ts` re-exports the result contract.

**Envelope.** `ScreeningResult` is discriminated by `status`. `CompletedResult` owns `rasters`,
`channels`, `snapshot`, `issues` and the composed `channelOrder`; `RejectedResult` and `CancelledResult`
own only `issues`. There is no partial result type, so a run cannot be labelled `completed` without
its rasters and snapshot, and a cancellation carries the diagnostics collected up to that point
instead of an empty array.

**Assembly.** Input gate → separation → tonal chain → canvas → per-channel composition. Each output
pixel's value comes from the sampled tonal value of its global input cell and the spot function of
its global output cell. A rejection at any stage returns the rejected envelope with every structured
diagnostic and allocates no raster or snapshot. `MAX_RASTER_PIXELS` (100 000 000 per channel) bounds
one allocation; a larger canvas is rejected with `output.invalid_dimension`.

**Self-contained snapshot.** Effective values, not references: engine version and quantisation rule,
profile identity/version/parameter hash, process kind, output DPI and LPI, input dimensions, PPI, bit
depth, layout, ICC id, source kind, samples per screen line and the declared minimum, canvas
dimensions and rounding rule with supplied PPI/DPI, lattice origin/phase/basis and conventions,
separation descriptors with role mapping or matrix or ICC provenance, per-channel TRC points and
interpolation, limits, applied flags, `cellPixelCount` and `addressableCoverageCount`, override
acknowledgements, and the preview flag.

**Canonicalisation and sealing.** `sealSnapshot` hashes the canonical bytes of every field except
`hash`, then returns a deep copy that is deeply frozen. `snapshotParameters` returns a fresh copy, so
`verifySnapshot` and `recomputeSnapshotHash` prove the record is self-contained: the recorded hash
must equal the hash of the embedded values. Mutating the caller's request or profile after a run does
not reach the snapshot.

**ICC.** `IccSeparation` now carries optional `sourceProfileBytes` and `destinationProfileBytes`.
`captureSeparation` rejects with `separation.unreproducible_transform` when either is absent or when
its SHA-256 differs from the recorded provenance hash. The bytes are embedded in the snapshot and
re-hashed on verification, so a path to an editable file is never sufficient.

**Tiling.** `tiles` restricts which pixels are written, never how they are computed: every pixel is
still derived from its global cell, so a partition that covers the canvas reproduces the whole-image
bytes exactly, and stage summaries and the snapshot hash are unchanged. The write mask is built once
per job; a tile with a non-integer or non-positive extent is rejected with
`output.invalid_dimension` rather than silently ignored. Memory-bounded allocation is a later
performance ticket; this ticket fixes the identity contract.

## Canonicalisation note: base64 case

The original spec clause said binary payloads use lowercase base64. Lowercasing base64 is **not
injective**: base64 is case-sensitive, so `[0x00]` encodes as `AA==` and `[0x68]` as `aA==`, and
folding both to lowercase collapses two distinct payloads onto `aa==`. That would let two different
ICC profiles share a canonical byte sequence and a hash, defeating the content addressing this
ticket exists to provide. The implementation keeps standard, case-preserving base64 and pins the
injectivity with a test. Because `.scratch/` is the canonical specification, `spec.md` §9 was amended
to state case-preserving base64 with this rationale instead of leaving the authority and the code
contradicting each other.

## Verification

- **Focused suite:** `tests/unit/halftone/result.test.ts` — 22 tests, 22 passed.
- **Full check:** `npm run check` exit 0 — 356 passed, 4 skipped (20 files, 19 passed + 1 skipped).
- **Build:** `npm run build` — clean, bundle 30.9 kB.
- **Whitespace:** `git diff --check` — clean.
- **Golden evidence:** the pinned fixture hashes to
  `cab7c3a948b8a0ca9ad2f38ec0be357351ecf844e9e287bf01b209ee9e393baa` with a 2424-character
  canonical record.
- **Tiling evidence:** whole-image and three partitions (quadrants, three horizontal strips, four
  ragged non-uniform tiles) produce identical raster bytes, identical `summaries.screened` and the
  same snapshot hash.
- **Immutability evidence:** mutating `profile.id`, a channel role and the input bytes after a run
  leaves the snapshot hash, canonical text and verification result unchanged.

## Review and corrections

- **GGA (`gga run`, opencode provider, STRICT_MODE):** **STATUS: PASSED** on the 6 staged files
  (result contract, snapshot module, assembler, issue registry, separation contract, result suite).
  Non-blocking observations were reviewed and the three actionable ones were fixed before commit.
- **Blocker fixed — contradictory outcome contract.** `contracts/request.ts` still exported
  `ScreeningOutcome`/`CompletedOutcome` with a `status: 'completed'` shape that carried only
  `issues`, and the barrel exported it next to the real envelope. Nothing imported it, but it was
  exactly the partial-completed shape this ticket forbids. Removed; `OutcomeStatus` stays.
- **Finding fixed — false field equivalence.** `SnapshotInput.minimumSamplesPerScreenLine` was being
  populated from `profile.minimumCellPixels`, which is a minimum cell size in output pixels, not a
  minimum input samples per screen line. Renamed to `minimumCellPixels` and documented, so the
  recorded value matches the declared one.
- **Gap fixed — ICC immutability was untested.** Added a test that mutates the caller's
  `sourceProfileBytes` array after a run and asserts the snapshot hash, canonical text, embedded
  bytes and verification are unchanged. The code already copied the bytes twice; now the claim is
  pinned for the ICC path.
- **Finding fixed — canonical spec contradicted the code.** `spec.md` §9 still said "lowercase
  base64". Because `.scratch/` is the canonical specification, the ticket note alone was not enough:
  §9 was amended to state standard case-preserving base64 (RFC 4648 section 4) with the injectivity
  rationale, so the authority and the implementation now agree.
- **Finding fixed — over-stated tiling criterion.** The acceptance criterion now says byte identity
  holds "when the tile union covers the canvas", matching what the partial-tile test pins (outside
  pixels stay `0`).
- **Finding fixed — duplicated cell-range enumeration.** `cellRangeFor` in the assembler repeated
  the corner-plus-ring bound already inlined in `computeAddressability`. Extracted as
  `cellIndexRange` in `geometry.ts` and called from both, so the addressability counts and the
  raster loop cannot drift apart.
- **Finding fixed — misleading field name.** `CompletedResult.stageTrace` carried `channel:<id>`
  labels, but the spec defines the stage trace as per-cell tonal values. Renamed to `channelOrder`,
  which is what it holds and what it is for; the real trace belongs to the trace API.
- **Accepted as-is — ticket status.** The acceptance boxes and this record are staged while `Status:`
  remains `ready-for-agent`; the close commit flips it to `done` after remote integration, matching
  the precedent in `7d2f9a4`.
- **Noted, not changed — glossary gap.** `GLOSSARY.md` lists `tile` under _Avoid_ for the halftone
  cell, while `OutputTile` uses "tile" for a canvas partition. The concepts differ and the code
  documents its meaning; the gap is left for `/domain-modeling` instead of editing the glossary
  silently.
- **Re-verification after corrections:** focused 22 tests pass; `npm run check` exit 0; build clean;
  `git diff --check` clean.
