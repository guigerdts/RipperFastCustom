# 08: Result assembly, self-contained snapshot and reproducibility

Type: task
Status: ready-for-agent
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

- [ ] A completed result contains one binary raster per channel at the output DPI plus the snapshot;
      a rejected result contains no rasters; a cancelled result contains no rasters and no snapshot.
- [ ] The snapshot embeds effective parameter values, not only hashes: role mapping, transfer
      functions, matrix coefficients, TRC points, limits, lattice and boundary conventions, and the
      addressability distinction.
- [ ] The snapshot excludes timestamps, paths and host identifiers, and is immutable against later
      profile or request mutations.
- [ ] Canonicalisation is versioned, key-sorted, UTF-8, locale-free and timestamp-free; numbers use
      the exact IEEE-754 binary64 encoding and binary payloads use lowercase base64.
- [ ] The same effective parameters produce the same canonical bytes and hash; a golden test pins
      one byte sequence and its SHA-256.
- [ ] An ICC transform embeds its profile bytes or a content-addressed immutable artifact verified by
      hash; when the bytes cannot be captured the run is rejected as
      `separation.unreproducible_transform`.
- [ ] Given the snapshot and the same input bytes, every effective parameter and the separation
      provenance are reconstructable without the editable profile and without any mutable external
      file; re-running produces identical output in the declared numeric environment.
- [ ] Whole-image and tiled processing produce byte-identical rasters, stage summaries and snapshots.
- [ ] Every issue emitted by this stage uses the shared contract from 02; no module-local code is
      introduced.
- [ ] `npm run check` exits 0.

**Tests:**

- Result-shape tests for `completed`, `rejected` and `cancelled`.
- Snapshot golden test: one canonical byte sequence and its SHA-256.
- Mutation test: edit or remove the profile after a run; the snapshot, its interpretation and a
  re-run are unchanged.
- Reconstruction test: snapshot plus input bytes reproduce every parameter and the same output.
- ICC test: embedded bytes accepted; missing bytes rejected with
  `separation.unreproducible_transform`; hash mismatch rejected.
- Tiled test: whole-image and tiled runs are byte-identical.
