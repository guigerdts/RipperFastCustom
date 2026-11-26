# 03: Input contract and prepared-artwork detection

Type: task
Status: ready-for-agent
Feature: halftone-engine
Spec ticket: 2 of 12
Spec: ../spec.md

**What to build:** The input gate of the public seam. Continuous-tone RGB or grayscale 8/16-bit
input with explicit PPI is accepted and passed to the next stage. Missing PPI, unsupported bit depth
or layout, and binary, pre-separated or pre-screened input are rejected with stable issue codes. An
explicit prepared-artwork override is accepted only with an acknowledgment that is recorded and
warned. The engine never invents a file resolution or silently converts an input layout.

**Blocked by:** 02 (shared contracts).

**Issue contract:** Emits only issues registered by the shared contract in 02; no module-local code
is introduced.

**Execution note:** May run in parallel with the other tickets blocked only by 02 when edit surfaces
are disjoint; otherwise sequential.

**Scope:**

- Input validation for continuous-tone RGB/gray, 8- and 16-bit, explicit PPI.
- Prepared-artwork detection signals and the explicit override path.
- Stable issue codes and scopes for every rejection.
- A rejection carries no rasters.

**Out of scope:** separation, tonal processing, geometry, screening and any automatic resampling or
colour conversion.

**Acceptance criteria:**

- [ ] A continuous-tone RGB or grayscale 8/16-bit input with explicit PPI is accepted.
- [ ] A missing PPI is rejected with a stable `input.ppi_missing` issue.
- [ ] An unsupported bit depth or channel layout is rejected with a stable issue.
- [ ] A binary, pre-separated or pre-screened input is rejected with a prepared-artwork issue.
- [ ] An override without an explicit acknowledgment is rejected; with an acknowledgment it is
      recorded for the snapshot and produces a warning.
- [ ] A rejected outcome contains no rasters.
- [ ] Every issue emitted by this stage uses the shared contract from 02; no module-local code is
      introduced.
- [ ] `npm run check` exits 0.

**Tests:**

- Table-driven input fixtures: RGB 8-bit, RGB 16-bit, grayscale 8-bit, grayscale 16-bit and an
  unsupported layout.
- Prepared-artwork fixtures: one per detection signal; each rejects with the prepared-artwork code.
- Override test: absent acknowledgment rejects; present acknowledgment completes with a warning and
  a recorded override.
- Rejection test: no raster is allocated or returned.
