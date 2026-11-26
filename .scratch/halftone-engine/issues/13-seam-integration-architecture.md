# 13: Engine seam integration tests and architecture-boundary extension

Type: task
Status: ready-for-agent
Feature: halftone-engine
Spec ticket: 12 of 12
Spec: ../spec.md

**What to build:** The final integration gate: the end-to-end acceptance suite through the single
public screening seam, plus the extension of the existing architecture-boundary check to every new
engine module. The suite must exercise the three public outcomes — `completed`, `rejected` and
`cancelled` — through the seam, plus the whole-image versus tiled byte identity, the declared
determinism scope and the `npm run check` and `npm run build` gates. It adds no physical preset and
no new public surface beyond the single seam.

**Blocked by:** 02, 03, 04, 05, 06, 07, 08, 09, 10, 11 and 12.

**Scope:**

- Acceptance matrix through the public seam.
- Whole-image versus tiled byte identity.
- Architecture-boundary extension to the new modules.
- Determinism-scope assertions.
- Final `npm run check` and `npm run build` gates.

**Out of scope:** UI, module wiring, export, calibration workflow, FM, hybrid, spot screening, DTF
physics and mesh simulation.

**Acceptance criteria:**

- [ ] The final gate drives all three public outcomes through the seam — `completed`, `rejected` and
      `cancelled` — and each matches the outcome shape defined by the spec.
- [ ] The acceptance matrix covers every spec acceptance criterion, including the three final
      controls (boundary definitions, determinism scope, self-contained snapshot).
- [ ] Whole-image and tiled processing produce byte-identical rasters, stage summaries and
      snapshots.
- [ ] Byte identity is asserted only for the same runtime and declared numeric environment;
      cross-runtime comparison uses the declared tolerance and no universal binary equivalence is
      claimed.
- [ ] No engine module references the host, DOM, filesystem, network or plugin storage; the
      architecture-boundary check covers the new modules.
- [ ] No physical preset appears in any fixture; all values are declared by the fixture or profile.
- [ ] `npm run check` exits 0 and `npm run build` exits 0.
- [ ] No new dependency is added.

**Tests:**

- Outcome-coverage test: one seam test per public outcome — `completed`, `rejected` and `cancelled` —
  asserting the shape and that no rasters leak on rejection or cancellation.
- Acceptance matrix: one or more seam tests per spec acceptance criterion, driving only the public
  entry.
- Tiled test: whole-image and tiled runs are byte-identical.
- Boundary scan: the existing architecture-boundary check includes every new engine module.
- Determinism test: repeated same-runtime runs are byte-identical; a tolerance-based cross-runtime
  comparison is documented and exercised where applicable.
- Gate test: `npm run check` and `npm run build` both exit 0.
