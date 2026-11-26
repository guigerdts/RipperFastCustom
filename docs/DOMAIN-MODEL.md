# Halftone Engine — Domain Model

Conceptual model for the Graphics Core and the Halftone Engine. Vocabulary lives in
`GLOSSARY.md`; architectural decisions live in `docs/adr/`. This document records entities,
relations, invariants and rules, and separates what is settled from what still needs evidence.

**Status: incomplete by design.** Hybrid screening, spot-colour screening rules, mesh-to-LPI,
concrete CMYK angles and DTF physical parameters remain unverified. Do not treat this model as
complete.

## Entities

| Entity             | Identity                  | Domain content                                                         |
| ------------------ | ------------------------- | ---------------------------------------------------------------------- |
| Image source       | The input artifact        | Continuous-tone raster, dimensions, PPI, colour data, ICC              |
| Ink channel        | Channel role within a job | Independent separation; data kind (tone or mask); tonal values         |
| Production profile | Named profile             | Process kind, physical conditions, per-channel parameters, limits, TRC |
| Output result      | One screening run         | Screened raster per channel plus immutable snapshot                    |

`Separation` is a transformation, not an entity. `Screening configuration` (screen) is a binding
of method and parameters to a channel inside a profile, not an entity. `Halftone cell` and `Dot`
are derived geometric concepts, not persisted entities.

## Value objects

Commanded, corrected, reproducible and screening-result tonal values; frequency; angle; dot
shape; highlight and shadow critical areas; mesh count; choke; expansion; output resolution.

## Relations

```
Image source --separation--> 1..N Ink channels
Ink channel --screening configuration--> Screen (method + parameters)
Screen --grid--> Halftone cells
Halftone cell --thresholding--> Dot
Production profile --owns--> screen parameters, TRC, critical areas, process attributes
Ink channel + Production profile --screening--> Output result
Output result --records--> profile snapshot, TRC, limits, method, resolution, engine version
```

## Invariants

- **I1 — Cell geometry.** For conventional orthogonal AM, nominal cell side is `1/LPI` inch and
  its nominal pixel representation is `output DPI / LPI`. Fractional values are allowed and never
  silently rounded. This relation is not universal to every screening method.
- **I2 — Channel binding.** Every ink channel has a screening configuration compatible with its
  profile and method. Required parameters depend on the method; not every method needs frequency
  and angle.
- **I3 — Tonal chain.** Commanded → corrected → reproducible → screening result are four
  conceptual stages with observable values. An identity transformation is a valid stage, not a
  skipped one. TRC monotonicity is **not** assumed; it must be specified and validated first.
- **I4 — Dot area.** Normalised dot area lies in [0,1]. Highlight and shadow critical areas are
  profile-specific and must be backed by calibration or validation data; no universal values.
- **I5 — Resolution and frequency.** No configuration may ignore the relation between output
  resolution and screening frequency when the method makes it applicable. No universal formula
  for physically reproducible tonal levels.
- **I6 — Channels.** Four channels are never assumed. Channel set and count must match process
  and profile, allowing N-channel configurations.
- **I7 — White mask.** The DTF white mask is not colour information. It may be an ink channel
  with role `white` and data kind `mask`.
- **I8 — Prepared artwork.** Pre-screened, binary or pre-separated material never enters the
  continuous-tone pipeline silently; it is detected, routed to the prepared-artwork path, and
  validated with warnings where appropriate.
- **I9 — Geometric precision.** No silent geometry rounding and no implicit unit conversion.

## Rules

- **R1** A profile applies only to the channel set it was defined for.
- **R2** TRC is per channel, applied deterministically, original preserved and recorded.
- **R3** Angles come only from the profile; conversions between angular conventions are explicit.
- **R4** An unvalidated parameter combination produces a warning, never a silent pass.
- **R5** Process-specific attributes live in the profile, never in shared entities.

## Shared and process-specific concepts

| Shared                                                                                                   | Screen printing                                                | DTF                                                                    | Offset / CMYK                                                    |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Image source, separation, ink channel, cell, dot, frequency, angle, tonal values, profile, output result | Mesh count, thread diameter, stencil thickness, ink, substrate | Print resolution, white mask and coverage, choke, expansion, film, ICC | Rosette-producing angle sets, conventional rulings (values only) |

## Decision status

### Settled

Continuous-tone input only (ADR-0001); strict PPI/DPI/LPI; geometric cell for AM (ADR-0002);
angles owned by profiles (ADR-0003); TRC compensation only in v1 (ADR-0004); generic ink channels
(ADR-0005); DTF independent (ADR-0006); no universal tonal-level formula (ADR-0007); output
results record an immutable snapshot (ADR-0008); screening configuration is method-dependent
(ADR-0009); four explicit tonal stages (ADR-0010); rosette and moiré distinct; critical areas
profile-owned; mesh count as a profile constraint.

### Conditional — pending validation

- TRC monotonicity: specify and validate before making it a domain constraint.
- `a_wf` / `a_vf` values: depend on calibration data per process.
- Quantisation formula and sampling effects: to be specified in `to-spec`.
- Mesh-to-LPI relation: warning only until verifiable manufacturer or process data exists.

### Open evidence gaps

- Hybrid screening: no accessible source.
- Spot-colour screening mechanics.
- Concrete CMYK screen angles: Adobe documents 108/162/90/45 for its filter; the classic
  literature set is unverified and not interchangeable.
- DTF physical parameters: resolution, white coverage, choke/expansion values.
- Choke and expansion: general prepress concepts, not source-verified this session.

### Out of scope for v1

- FM implementation (documented as first-class, not built).
- Hybrid screening.
- Spot-colour screening rules.
- Mesh physical simulation.
- Predictive mechanical or Yule–Nielsen gain models.
- Universal CMYK angle presets.
- DTF value presets.

## Related documents

- `GLOSSARY.md` — vocabulary and verification status.
- `docs/adr/0001`–`0010` — decisions made from this model.
- `docs/DECISIONS.md` — closed E0/E1 record (D1–D14).
- `.scratch/halftone-engine/issues/01-domain-grill-agenda.md` — the grilling session.
