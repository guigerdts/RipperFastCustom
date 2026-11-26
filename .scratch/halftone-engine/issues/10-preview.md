# 10: Preview mode through the same pipeline

Type: task
Status: ready-for-agent
Feature: halftone-engine
Spec ticket: 9 of 12
Spec: ../spec.md

**What to build:** An explicit preview mode that reuses the same input validation, separation, tonal
chain, geometry, sampling and thresholding logic with a reduced effective output DPI, expressed as a
declared integer divisor of the output DPI or as a target preview DPI. A preview result is flagged,
records its effective resolution, allocates no full-resolution rasters and cannot be accepted by the
output or export contract as a production result. It adds an informational preview issue.

**Blocked by:** 08 (result and snapshot).

**Execution note:** May run in parallel with the other tickets blocked only by 08 when edit surfaces
are disjoint; otherwise sequential.

**Scope:**

- Preview request flag and effective-resolution derivation.
- Shared pipeline with reduced effective DPI.
- Preview flag and effective resolution in the result and snapshot.
- Informational preview issue.
- Output/export rejection of preview results.

**Out of scope:** a separate preview algorithm, preview UI and export wiring.

**Acceptance criteria:**

- [ ] A preview result is flagged `preview: true` and records its effective preview resolution in
      the snapshot.
- [ ] Preview uses the same validation, separation, tonal chain, geometry, sampling and thresholding
      logic as a full run.
- [ ] Preview allocates no full-resolution rasters.
- [ ] A preview result cannot be accepted by the output/export contract as a production result.
- [ ] Preview produces an informational preview issue.
- [ ] `npm run check` exits 0.

**Tests:**

- Geometry comparison: preview and full runs use the same lattice and angle logic at their
  respective effective DPIs.
- Flag test: preview result is flagged and records its effective resolution.
- Allocation test: peak allocation stays below the full-resolution bound.
- Output-contract test: a preview result is rejected as production output.
- Issue test: the informational preview issue is present and correctly scoped.
