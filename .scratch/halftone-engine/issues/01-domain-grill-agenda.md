# 01 — Domain grill agenda: Graphics Core & Halftone Engine

Type: grilling
Status: ready-for-human
Blocked by: none
Owner: architecture session (grill-with-docs)

## Purpose

Prepare a `grill-with-docs` session that settles the **domain vocabulary** for the Graphics
Core and the Halftone Engine before any algorithm is written. Output of that session:
`GLOSSARY.md` (root, created lazily by `/domain-modeling`) plus any ADR the decisions
deserve. This ticket is the agenda; it does not decide anything.

Constraints carried from the task:

- No algorithms, no signatures, no data structures in this session.
- Do not treat two terms as equivalent because they sound alike; confirm the prepress
  meaning first.
- Domain concepts stay separated from implementation details (see the boundary section).

## Verified anchors (secondary sources — confirm against primary references in the session)

Sources consulted while preparing this agenda: Wikipedia _Dot gain_ and _Halftone_
(both citing Johansson/Lundberg/Ryberg, _A Guide to Graphic Print Production_; Yule–Nielsen
TAGA 1951; Viggano GRL model 1983; Haller/FOGRA 1979). Treat these as **starting points to
verify**, not as the glossary.

| Term                                 | Anchor found                                                                                                                                                                                                                                                      | Still to verify                                                                                                                           |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Tonal value / dot gain (TVI)         | Dot gain = increase in area fraction between prepress dot and printed dot: `DG = a_print − a_form`. 30% → 50% is +20%. Measured with densitometer at 40% and 80% references; ~23% at 40% tone for 150 lpi on coated paper. Greatest in midtones (40–60%).         | Whether our domain means _physical_ dot gain, _optical_ (Yule–Nielsen) gain, or both; who owns compensation (TRC curves) in our pipeline. |
| LPI (screen ruling)                  | Lines per inch of the screen, measured parallel to the screen angle. Screen printing 45–65 lpi; laser 300 dpi → 65 lpi; 600 dpi → 85–105 lpi; offset coated 85–185 lpi.                                                                                           | Which ranges matter for serigrafía/DTF specifically — the table above is offset/screen-print oriented.                                    |
| Screen angle                         | Degrees clockwise from a line to the left (9 o'clock = 0°). Standardized set avoids moiré and forms rosettes.                                                                                                                                                     | The exact canonical angles per ink and whether our domain uses the same zero reference.                                                   |
| Dot shape                            | Round (dots meet at 70% tonal value), elliptical (meet at 40% and 60%), square (corners meet at 50%). Shape preference depends on print method; dot gain depends on dot shape (Haller).                                                                           | Which shapes we must support first; whether "dot shape" is a domain term or an engine option.                                             |
| Halftone cell                        | Low-frequency local area of the output image; each cell maps to an area of the continuous-tone input; inside it a centered variable-sized dot; inked/non-inked ratio encodes the input luminance. In digital halftoning the cell is a group of monochrome pixels. | Whether "cell" is a geometric area, a grid of pixels, or both in our vocabulary.                                                          |
| Output resolution vs file resolution | Higher pixel resolution reproduces more detail but demands a matching screen ruling or the result posterizes; file resolution is matched to output resolution.                                                                                                    | How Photoshop's own "Resolution" field (pixels/inch) maps to our terms.                                                                   |
| Sampling / thresholding              | Not covered by the sources consulted.                                                                                                                                                                                                                             | Must be defined from a primary source during the session.                                                                                 |

## Open questions (the grill frontier)

Round 1 — vocabulary that everything else depends on:

1. **Raster image** — is it the _source_ continuous-tone image, the _separated_ image, or
   any pixel buffer? Does the term change after separation?
2. **Pixel** — a sample of the source, or a printed on/off element? In digital halftoning the
   same word covers both; which do we mean in each context?
3. **DPI vs PPI vs LPI** — three different units that get used interchangeably in tooling.
   Fix the unit for: source image, output device, screen ruling. (Photoshop labels its image
   resolution field "Resolution" in pixels/inch, which is a known source of confusion.)
4. **Output resolution** — device capability (e.g. imagesetter/printer) or the resolution we
   ask Photoshop to render at?

Round 2 — depends on round 1:

5. **Halftone cell** — geometry (a square of side `1/LPI` inch) or pixel grid? Both? What
   fixes its size once DPI and LPI are settled?
6. **Screen angle** — zero reference, units, and whether per-ink angles are part of the
   domain or of configuration.
7. **Dot shape** — domain concept (affects tonal reproduction) or implementation option?
8. **Tonal value** — the commanded area fraction, the perceived gray, or the printed
   coverage? Where does it live in the pipeline?

Round 3 — depends on rounds 1–2:

9. **Dot gain** — physical vs optical; measured vs modelled; does the engine _model_ it or
   only _accept a compensation curve_?
10. **Sampling** — the act of reading the source onto the cell grid? Resampling? Define before
    any resampler exists.
11. **Thresholding** — the binary decision per cell, and where the threshold comes from
    (ordered dither matrix, error diffusion state, direct level).
12. **AM vs FM screening** — is stochastic screening in scope for v1, or is the domain term
    just "screening method" with AM as the only implementation?

## Domain vs implementation boundary

**In scope (domain):** the twelve terms above, their units, their relationships, and the
invariants a prepress professional would expect to hold (e.g. a 50% command must not print
as 50% after gain).

**Out of scope (implementation — do not grill, do not put in the glossary):**

- algorithms (error diffusion, ordered dither, spot functions),
- data structures, buffer layouts, typed interfaces,
- performance targets, memory strategy, WebGL/worker usage,
- API v1 Photoshop calls, adapter methods, module file layout,
- test harness details.

Implementation decisions arrive later, in `to-spec` / `to-tickets`, and must use the
vocabulary this session fixes.

## Acceptance criteria for the session

- Every one of the twelve terms has a glossary entry **or** an explicit decision that it is
  out of domain.
- No two entries are defined as synonyms of each other without a stated reason.
- Units are explicit in every entry (inch, line, degree, percent, sample).
- Anything still unverified against a primary source is marked as such in `GLOSSARY.md`.
- ADRs are written only for decisions that are genuinely architectural (per
  `docs/agents/domain.md`), not for definitions.

## Comments

### 2026-11-26 — Round 1 closed

Seven decisions recorded. `GLOSSARY.md` created with the domain vocabulary, and four ADRs:
0001 continuous-tone input only, 0002 geometric halftone cell, 0003 screen angles in production
profiles, 0004 TRC compensation in v1. Hybrid screening, mesh-to-LPI rules, concrete CMYK angles
and DTF behaviour remain unverified and are listed under "Verification status" in the glossary.
Round 2 pending.

### 2026-11-26 — Round 2 closed

Seven more decisions recorded: AM and FM first-class with hybrid out of scope; ink channel as the
canonical concept; highlight and shadow critical areas as profile-owned limits; rosette and moiré
kept distinct; mesh count as a profile constraint without mesh simulation; no universal tonal
level formula; DTF as an independent process. Added ADR-0005 (generic ink channels), ADR-0006
(DTF independent) and ADR-0007 (tonal levels not from cell pixels). Hybrid, spot screening,
mesh-to-LPI and CMYK angle values remain unverified. Round 3 pending.

### 2026-11-26 — Round 3 closed

Conceptual model accepted: separation as a transformation, screening configuration as a
method-dependent binding, dot as derived, output result with an immutable profile snapshot, four
explicit tonal stages, white as an ink channel with mask data, process as an extensible profile
attribute, and invariants I1–I9 with method-scoped caveats. Added `docs/DOMAIN-MODEL.md`,
ADR-0008 (immutable snapshot), ADR-0009 (method-dependent screening configuration) and ADR-0010
(four tonal stages). Domain remains incomplete: hybrid, spot screening, mesh-to-LPI, CMYK angles
and DTF physical parameters are open. Next: scoped `to-spec` for the AM core.

### 2026-11-26 — Round 3 approved; to-spec opened

Owner approved the Round 3 close and authorized a scoped `to-spec` for the AM core. Domain work
committed as `8930f25`. Specification published at `.scratch/halftone-engine/spec.md` with
`Status: needs-triage` pending owner review. OD1 (separation conversion model) and OD2
(reproduction-limit semantics) need a decision before `to-tickets`.

### 2026-11-26 — Spec revision 2 (conditional approval incorporated)

Owner approved OD1 = C (declared mapping mandatory, ICC transform optional) and OD2 = A (linear
remap between `a_wf` and `a_vf`, clamped at both ends), with precision requests. Revision 2 of
`.scratch/halftone-engine/spec.md` now defines the admitted and rejected separation modes, requires
reproducible transform provenance per channel, records the exact limit remap and validation,
specifies lattice origin/phase/alignment, canvas boundary handling, the round-half-up canvas rule
and tile/block byte identity, formalizes addressability as distinct digital coverages, and replaces
the universal PPI/LPI rule with a profile-declared input-sampling threshold. `Status: needs-triage`
remains until this revision is approved. No code was changed.

### 2026-11-26 — Revision 2 approved; spec ready-for-agent

Owner approved revision 2 integrally and authorized `Status: ready-for-agent`. The three final
controls were run before the commit:

1. Boundary definitions: `round-half-up(x) = floor(x + 0.5)` on non-negative values, zero-dimension
   rejection, floor-based cell indexing for negative coordinates, exact edge-clamp replication and
   `clipped: true` with `marked / visible`.
2. Determinism scope: byte identity only for the same runtime and declared numeric environment
   (IEEE-754 binary64, no FMA contraction, no platform transcendentals); no universal binary
   equivalence across architectures.
3. Snapshot self-containment: effective parameter values embedded, not only hashes; ICC profile
   bytes or a content-addressed immutable artifact verified by hash; versioned canonicalisation and
   SHA-256; reconstruction without a mutable external file.

`npm run check` and `npm run build` passed. Commit: `docs(spec): add AM halftone core specification`
(local only, no push). Next: `to-tickets`.
