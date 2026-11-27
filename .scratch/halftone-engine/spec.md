# Halftone Engine v1 — AM Core Specification

Type: spec
Status: ready-for-agent — revision 2 approved; final controls applied before commit
Feature: halftone-engine
Owner: architecture session (`to-spec`)
Revision: 2 — approved (OD1 = C, OD2 = A; final controls: boundary definitions, determinism scope, self-contained snapshot)
Blocked by: none — OD1 and OD2 resolved; no product-level open decisions remain
Sources: `GLOSSARY.md`, `docs/DOMAIN-MODEL.md`, ADR-0001–ADR-0010, domain grill rounds 1–3

## Problem Statement

A prepress operator working in screen printing, DTF or CMYK currently has no halftone engine in
the plugin. Without one, the operator cannot turn a continuous-tone image into reproducible ink
patterns, cannot audit why a requested tone printed differently, and cannot trust that a result
will be interpreted the same way after a profile is edited.

The operator's real problem is not "apply a halftone filter". It is to obtain a deterministic,
auditable screening result whose units, geometry, tonal stages and profile parameters are
explicit, so that a printed result can be traced back to the exact configuration that produced
it. Generic image tools hide those decisions behind a single resolution field, silently round
cell geometry, assume four CMYK channels, and bake in angle or gain values that do not belong to
the operator's process.

## Solution

Build a pure, host-independent Halftone Engine v1 that implements conventional orthogonal AM
screening as the only screening method in this version. The engine:

- accepts continuous-tone input only, and routes binary, pre-separated or pre-screened material
  to an explicit prepared-artwork path instead of screening it again;
- separates the input onto N ink channels declared by a production profile, never assuming four
  channels or CMYK;
- validates the production profile by process kind and by screening method;
- applies the four observable tonal stages — commanded, corrected, reproducible, screening
  result — with a deterministic per-channel TRC and profile-owned reproduction limits;
- computes AM cell geometry in physical units with sub-pixel precision, deriving output pixels
  from `output DPI / LPI` without silent rounding;
- returns a per-channel raster plus an immutable snapshot containing the effective parameters
  needed to reproduce and interpret the result without the editable profile;
- reports typed warnings and errors instead of passing unvalidated combinations silently;
- offers a preview mode, cooperative cancellation, and measurable performance and memory bounds.

The engine contains no physical presets, no universal angle sets, no universal LPI ranges and no
predictive gain model. Every concrete value comes from a production profile or from calibration
data supplied by the caller.

## Scope Boundary

**In scope for this specification**

- Continuous-tone input contract.
- Separation onto N ink channels.
- Production profile with process discrimination and method validation.
- AM screening as the only implemented method.
- Four-stage tonal chain with observable values.
- Deterministic per-channel TRC.
- Per-channel, per-profile reproduction limits.
- AM geometry with sub-pixel precision.
- Output resolution and LPI relation.
- Per-channel raster result with a reproducible snapshot.
- Warnings and validations.
- Preview, cancellation, performance and memory requirements.

**Explicitly not in scope for v1 implementation**

- FM screening, hybrid screening and spot-colour screening rules.
- Mesh physical simulation and any mesh-to-LPI formula.
- Predictive mechanical or Yule–Nielsen gain models.
- Universal CMYK angle presets, LPI ranges, DTF values, choke or expansion values.
- DTF white generation, coverage, film behaviour or physical parameters.
- UI, module wiring, Photoshop host integration, file I/O and export formats.
- Calibration workflow and measurement.
- Multi-threading, workers or persistence.

## User Stories

1. As a prepress operator, I want to submit a continuous-tone RGB or grayscale image, so that the
   engine screens tone and not an already-screened artifact.
2. As a prepress operator, I want the engine to reject a binary, pre-separated or pre-screened
   image with an explicit prepared-artwork message, so that I never double-halftone an image
   irreversibly.
3. As a prepress operator, I want to override the prepared-artwork refusal only after an explicit
   acknowledgment, so that the decision is mine and is recorded.
4. As a prepress operator, I want the engine to require an explicit PPI for the input, so that it
   never invents a file resolution.
5. As a prepress operator, I want 8-bit and 16-bit input to follow one declared tonal
   quantisation, so that the same image does not change because of its bit depth.
6. As a prepress operator, I want an ICC identity to be recorded when present, so that colour
   provenance is traceable.
7. As a screen-printing operator, I want the image separated onto the ink channels my profile
   declares, so that a two-colour job is not forced into CMYK.
8. As a CMYK operator, I want CMYK to be one four-channel case of the same generic model, so that
   the engine does not special-case my process.
9. As a DTF operator, I want a white mask to be an ink channel with role `white` and data kind
   `mask`, so that white coverage stays distinguishable from colour.
10. As a prepress operator, I want separation to be a deterministic transformation that is either
    declared by the profile or injected by the caller, so that no hidden colour assumption changes
    my channels.
11. As a prepress operator, I want an unsupported or implicit separation rejected with a stable
    issue code, every transform to carry a reproducible identity and provenance, and each produced
    channel to record which transform produced it, so that I know what is missing and can trace a
    channel back to its conversion instead of receiving an opaque result.
12. As a production manager, I want the profile's process kind to be an extensible discriminant,
    so that screen printing, DTF, offset and future processes can coexist.
13. As a production manager, I want the profile to own angles, frequencies, dot shapes, TRC and
    limits, so that no universal value is imposed on my process.
14. As a production manager, I want a profile missing a required AM parameter to be rejected, so
    that the engine never silently defaults a physical value.
15. As a calibration technician, I want a per-channel TRC applied deterministically, so that a
    measured compensation curve reproduces the same corrected value every run.
16. As a calibration technician, I want the original TRC control points preserved in the result,
    so that I can audit which curve was used.
17. As a calibration technician, I want ambiguous TRC control points to be rejected, so that the
    mapping is never guessed.
18. As a calibration technician, I want TRC output monotonicity not to be assumed, so that an
    unvalidated constraint is not enforced before it is proven.
19. As a prepress operator, I want the four tonal stages to be observable per cell, so that I can
    see where a value changed and why.
20. As a prepress operator, I want an identity transformation to count as a valid stage, so that
    "no compensation" is explicit rather than invisible.
21. As a prepress operator, I want highlight and shadow critical areas applied per channel, so
    that the smallest reliable dot and the solid point come from my profile.
22. As a prepress operator, I want limit ranges outside [0, 1] or with `a_wf >= a_vf` rejected, so
    that a typo cannot silently invert my tonal range.
23. As a prepress operator, I want absent limits to be recorded as identity with an informational
    warning, so that I know no limit was configured.
24. As a screen-printing operator, I want the halftone cell defined as `1/LPI` inch, so that its
    physical size stays meaningful when output resolution changes.
25. As a screen-printing operator, I want the nominal cell pixel representation to be
    `output DPI / LPI`, so that I can predict addressability without the engine rounding it.
26. As a screen-printing operator, I want fractional cell sizes to be supported with sub-pixel
    placement, so that a requested frequency or angle is not silently changed.
27. As a screen-printing operator, I want screen angles measured from 9 o'clock clockwise, so that
    the convention is unambiguous.
28. As a screen-printing operator, I want angles to come only from the profile, so that the engine
    never injects a CMYK preset.
29. As a screen-printing operator, I want round, elliptical and square dot shapes validated by
    name, so that an unknown shape is rejected instead of guessed.
30. As a screen-printing operator, I want the dot area to grow monotonically with the reproducible
    tonal value for a fixed geometry, so that tone and coverage cannot move in opposite
    directions.
31. As a prepress operator, I want sampling defined as deterministic area coverage over the cell
    footprint, so that the same image and geometry always sample the same way.
32. As a prepress operator, I want thresholding defined per output pixel from the cell's spot
    function, so that the screening result is reproducible and testable.
33. As a prepress operator, I want the output canvas dimensions rounded by one declared rule and
    recorded, so that the only integer rounding in the pipeline is visible.
34. As a prepress operator, I want a warning when the output resolution and LPI leave too few
    output pixels per cell, so that I know addressability may be insufficient.
35. As a prepress operator, I want the engine to report the distinct digital addressable coverages
    derived from the actual thresholding, keeping requested tonal values, digital addressable
    coverages and physically reproducible values as separate concepts, so that no universal
    `cell pixels + 1` formula is imposed and no physical level is inferred.
36. As a prepress operator, I want a warning when two channels share the same angle, so that a
    known interference risk is surfaced without the engine pretending to detect moiré.
37. As a prepress operator, I want a warning when the input sampling ratio falls below the
    profile-declared minimum, so that a sampling-adequacy heuristic is surfaced without being
    presented as a universal physical limit.
38. As a prepress operator, I want a warning when a profile declares a mesh but no validated
    mesh-to-LPI relation exists, so that the unverified relation is not silently trusted.
39. As a prepress operator, I want a per-channel raster result at the output DPI, so that I can
    inspect or export each ink separation.
40. As a prepress operator, I want the result to include an immutable snapshot of the effective
    profile, separation provenance, lattice conventions, TRC, limits, method, resolution and engine
    version, so that an earlier result keeps its meaning after the profile is edited.
41. As a prepress operator, I want the snapshot to be sufficient to reproduce the result, including
    separation provenance, without the editable profile, so that traceability does not depend on
    external state.
42. As a prepress operator, I want the snapshot to exclude wall-clock timestamps and host
    identifiers, so that the same run is byte-identical and privacy-safe.
43. As a QA engineer, I want stable machine-readable issue codes with severities, so that warnings
    and errors can be asserted and localized.
44. As a QA engineer, I want any unvalidated parameter combination to produce at least a warning,
    so that nothing passes silently.
45. As a QA engineer, I want a preview mode that is explicitly flagged and can never be used as
    output, so that fast iteration cannot leak into production.
46. As a QA engineer, I want cancellation checked at a bounded frequency with no partial result,
    so that a cancelled run leaves no ambiguous state.
47. As a QA engineer, I want the engine to be deterministic and free of host, DOM and I/O access,
    so that it runs identically in Node tests and inside the plugin.
48. As a plugin developer, I want one public screening seam, so that tests drive the whole feature
    through its external contract instead of internal functions.
49. As a plugin developer, I want performance and memory bounds expressed as measurable
    requirements, so that a regression is detected rather than debated.
50. As a future maintainer, I want FM, hybrid, spot rules and DTF physics left out explicitly, so
    that the AM core can ship without speculative abstraction.
51. As a QA engineer, I want whole-image and tiled processing to produce byte-identical rasters,
    stage summaries and snapshots, so that block processing cannot shift the lattice or change a
    result.

## Implementation Decisions

### 1. Pipeline and public contract

The engine exposes one pure screening entry point. It accepts a continuous-tone input, a
production profile and a job request, and returns one typed outcome:

- `completed` — per-channel rasters, per-channel metadata, an immutable snapshot, warnings and an
  optional stage trace;
- `rejected` — typed issues and no rasters;
- `cancelled` — a cancellation status and no rasters or snapshot.

The pipeline runs in this order: input validation → separation → per-channel tonal chain → AM
screening → result assembly. Separation and screening are internal stages; the caller does not
orchestrate them. This keeps one public seam for the whole feature.

The engine is pure and synchronous from the caller's perspective. Cancellation is cooperative
through a caller-supplied token; no host, DOM, filesystem, network or storage access is allowed.
The existing architecture-boundary rule continues to apply to every new engine file.

### 2. Input contract

The input is a continuous-tone raster with:

- dimensions in pixels, both positive;
- PPI, positive and explicit — never defaulted;
- bit depth 8 or 16;
- channel layout RGB or grayscale;
- optional ICC identity or metadata;
- an optional declared source kind.

Binary (1-bit), pre-separated and pre-screened material is not normal input. The engine detects
the condition from declared signals — bit depth, channel layout, source-kind declaration, and a
documented tonal-distribution check — and returns `rejected` with a prepared-artwork issue that
names the alternative route. A caller may override only with an explicit acknowledgment; the
override and its reason are recorded in the snapshot and the result carries a prominent warning.

Missing PPI, unsupported bit depth, unsupported channel layout and non-positive dimensions are
errors. The engine never infers a resolution from the number of pixels.

Optional mask sources are supplied per mask channel role. A binary mask source is legitimate mask
data, not prepared artwork; the prepared-artwork rule applies to the continuous-tone input only.

### 3. Separation contract

Separation maps the continuous-tone input onto the N ink channels declared by the profile. Each
channel declares a role (a process colour name, or `white`), a data kind (`tone` or `mask`), and an
explicit mapping from input data to channel data.

**No implicit conversion.** The engine never derives an RGB-to-CMYK or RGB-to-N-channel
conversion, never applies a hidden matrix, and never infers a colourimetric transform from the
input layout. A conversion exists only when the profile declares it or the caller injects it.

v1 admits exactly these separation modes:

1. **Channel-preserving declared mapping** — each input channel maps to exactly one ink channel
   through an explicit role mapping and an optional per-channel transfer function. Grayscale to one
   tone channel and N-to-N channel-preserving jobs use this mode. No channel mixing occurs.
2. **Declared linear mixing** — the profile supplies an explicit coefficient matrix from input
   channels to ink channels plus optional per-channel transfer functions. The engine validates
   dimensions and finiteness and applies the matrix exactly as declared. The engine does not
   derive, endorse or correct the coefficients; the profile owner is responsible for them. This
   mode is not a colourimetric claim and does not convert to CMYK unless the declared matrix does
   so explicitly.
3. **ICC transform injected by the caller** — the profile references an ICC transform and the
   caller supplies a pure, deterministic converter. The engine embeds no colour science.

Everything else is rejected. In particular, v1 rejects: implicit RGB-to-CMYK or RGB-to-N
conversion; a mapping that mixes channels without a declared matrix; a matrix with wrong
dimensions or non-finite coefficients; a channel role or count mismatch; automatic DTF white
generation; spot-colour-specific rules; and an ICC transform without reproducible provenance.

**Transform provenance.** Every separation transform must be identifiable and reproducible:

- a stable transform identity and version;
- the transform type (channel-preserving mapping, declared linear mixing, or ICC);
- a canonical hash of the declared mapping, matrix and transfer functions;
- for an ICC transform, the source and destination profile identities and hashes, the rendering
  intent, the black-point-compensation flag, and a hash of every parameter that affects the
  result;
- the hash algorithm and the canonicalisation rule used to compute the hashes.

The engine validates that the required fields are present and well formed. It records
caller-supplied hashes but does not attest to their truth unless the caller also supplies the
hashed bytes and a verifier. A transform that cannot supply a stable identity and the required
provenance is rejected with `separation.unidentifiable_transform`; an opaque transform is never
presented as reproducible.

**Per-channel identification.** Each ink channel's metadata records the identity of the transform
that produced it. When one transform produces several channels, the channels share the transform
identity and the snapshot stores the descriptor once. A result whose channel cannot be traced to
its transform is invalid.

A `white` channel with data kind `mask` requires an explicit mask source; automatic DTF white
generation is out of scope, and a missing source is an error. Separation remains a transformation,
not a persisted entity; a caller may cache its output, but the cache is never a second source of
truth.

### 4. Production profile

A production profile is named and versioned. It declares:

- a process kind — an extensible discriminant such as `screen-printing`, `dtf`, `offset-cmyk` or
  a custom value;
- a screening method per channel binding;
- for each ink channel: role, data kind, screening configuration, TRC and reproduction limits;
- process attributes such as mesh, ink and substrate, opaque to the engine except for declared
  constraints;
- optional allowed output resolutions and an optional minimum-cell-pixel threshold.

Validation follows the selected method. For AM, every channel binding requires a positive
frequency in LPI, a finite angle in degrees, and a known dot shape. A missing required value is an
error; the engine never substitutes a default physical value. A non-AM method is rejected with
`profile.unsupported_method` in v1, even though FM is documented as a first-class future method.

The profile is the only owner of concrete angles, frequencies, dot shapes, TRC points and limits.
The engine contributes only the angular reference (9 o'clock, clockwise positive) and the
mathematical bounds. Editing a profile after a run must not change how that run is interpreted.

### 5. Tonal chain and TRC

Each channel carries four observable stages:

1. **Commanded (`a_commanded`)** — the tonal value produced by separation.
2. **Corrected (`a_corrected`)** — the commanded value after the channel's TRC.
3. **Reproducible (`a_reproducible`)** — the corrected value after the channel's reproduction
   limits.
4. **Screening result** — the marked area fraction produced by thresholding.

An identity transformation is a valid stage. A missing TRC is recorded as identity; a missing
limit is recorded as identity. Neither is a skipped stage. The trace preserves `a_commanded` and
`a_corrected` verbatim and records `a_reproducible` as an independent stage; it is never an alias
or an overwrite of the corrected value.

Tonal values are represented as 16-bit unsigned fixed-point in [0, 1], with a single declared
`round-half-up` rule (`floor(x + 0.5)` on non-negative values) at every tonal conversion. Input
8-bit samples are expanded deterministically; 16-bit samples are used directly. The quantisation is
recorded in the snapshot. Geometry uses IEEE-754 double precision and is not part of the tonal
quantisation.

A TRC is an ordered set of control points in [0, 1] with a declared interpolation. v1 supports
linear interpolation and clamps outside the control-point domain to the endpoint outputs.
Control-point inputs must be strictly increasing and unique; duplicates or non-increasing inputs
are rejected as ambiguous. Output monotonicity is **not** enforced in v1 because it remains
pending validation; a non-monotonic output produces an informational diagnostic, not a rejection.

The result exposes per-channel stage summaries (minimum, maximum, mean, and counts at 0 and 1) and
an optional trace for a caller-specified set of cell coordinates or a rectangular cell region.
The trace returns all four values per cell. The screening-result value is the marked area fraction
of that cell. This makes the chain auditable without storing a per-pixel trace for the whole
image.

### 6. Reproduction limits

Each channel declares a highlight critical area `a_wf` and a shadow critical area `a_vf`, both
normalized to [0, 1], with `a_wf < a_vf`. Limits are applied after the TRC, never before.

The v1 semantics are a linear remap of the corrected value:

- `a_corrected <= a_wf` produces `a_reproducible = 0`.
- `a_corrected >= a_vf` produces `a_reproducible = 1`.
- `a_wf < a_corrected < a_vf` produces
  `a_reproducible = (a_corrected - a_wf) / (a_vf - a_wf)`.

The commanded and corrected values are preserved unchanged; the reproducible value is recorded as
an independent stage, never as an overwrite of the corrected value. This makes "below the smallest
reliable dot" print as no dot and "above the closing point" print as solid.

Validation is mandatory: both limits must be finite and normalized to [0, 1]; `a_wf` must be
strictly less than `a_vf`; any invalid or inverted range is rejected. A channel with no declared
limits uses identity (`a_wf = 0`, `a_vf = 1`), is recorded as identity, and produces an
informational warning that no reproduction limits are configured. No default physical values are
assigned.

### 7. AM geometry, sampling and thresholding

**Cell geometry.** For conventional orthogonal AM, the cell's physical side is `1 / LPI` inch and
its nominal pixel representation is `output DPI / LPI`. The ratio is nominal and may be
fractional. The engine must not round it to an integer, and must not change the requested
frequency or angle to make the geometry fit.

**Coordinate system and angular convention.** Output geometry uses a physical coordinate system
with `x` increasing to the right and `y` increasing downward, with the origin at the top-left
corner of the output canvas. Pixel `(0, 0)` has its centre at `(0.5, 0.5)` in this system. Zero
degrees is the 9 o'clock direction, the negative `x` axis. Positive angles increase clockwise. The
angle comes from the profile; the engine performs no implicit conversion between angular
conventions.

**Lattice origin, phase and alignment.** The AM lattice is an infinite lattice anchored at the
output canvas origin with phase 0: one cell corner coincides with the canvas origin. The basis
vector `u` has length `output DPI / LPI` output pixels — the nominal, possibly fractional cell
pitch — and points along the 9 o'clock direction rotated clockwise by the channel angle. The basis
vector `v` is `u` rotated 90 degrees clockwise and has the same length. Cell `(i, j)`, with integer
indices that may be negative, covers the parallelogram
`origin + (i + alpha) * u + (j + beta) * v` for `alpha, beta` in `[0, 1)`. The lattice is global:
every row, tile and block uses the same origin, phase and basis. A tile boundary never re-anchors
or shifts the lattice.

**Cell indexing and negative coordinates.** For a point `p` in output coordinates, let
`a = dot(p - origin, u) / dot(u, u)` and `b = dot(p - origin, v) / dot(v, v)`. Then `i = floor(a)`,
`j = floor(b)`, `alpha = a - i` and `beta = b - j`, with `alpha` and `beta` in `[0, 1)`. `floor` is
the mathematical floor, not truncation toward zero: `a = -0.25` yields `i = -1` and `alpha = 0.75`.
Truncation is forbidden because it would produce a negative `alpha` and break the half-open cell
convention. Because `v` is `u` rotated by 90 degrees, the basis is orthogonal and this inverse is
exact.

**Canvas boundaries and edge-clamp.** The infinite lattice is clipped to the output canvas. Cells
that intersect the canvas boundary still participate in sampling and thresholding for the output
pixels that lie inside the canvas; no pixel is generated outside it.

Input pixel `(k, l)` covers `[k, k + 1) x [l, l + 1)` in input pixel coordinates and has its centre
at `(k + 0.5, l + 0.5)`. The edge-clamp policy extends the input to the whole plane by replicating
border pixels: an area element at `(x, y)` outside the input uses the value of pixel
`(clamp(floor(x), 0, W - 1), clamp(floor(y), 0, H - 1))`, where `W` and `H` are the input
dimensions. Area-coverage sampling integrates over the cell's full footprint against this extended
image, so the coverage weights always sum to the cell area; no area is dropped or renormalised.
Negative coordinates follow the same rule: `floor(-0.2) = -1` clamps to pixel `0`.

A cell is `clipped` when its full geometric footprint is not contained in the output canvas. For a
clipped cell, the trace's screening-result fraction is `marked / visible`, where `visible` is the
count of output pixels whose centres lie inside both the cell and the canvas, and `marked` is how
many of those are marked. The entry carries `clipped: true`. An unclipped cell uses its full pixel
count as `visible`. A cell with `visible = 0` lies entirely outside the canvas and is not evaluated:
it produces no trace entry and no addressability contribution. Addressability is computed only on
unclipped cells.

**Canvas dimensions.** The input's physical extent is `input width in pixels / input PPI` by
`input height in pixels / input PPI`. For a non-negative real `x`,
`round-half-up(x) = floor(x + 0.5)`; exact halves round up (`0.5 -> 1`, `1.5 -> 2`). The output
raster dimensions are `round-half-up(physical width * output DPI)` and
`round-half-up(physical height * output DPI)`, computed in double precision from the supplied
values. The products are non-negative because PPI, DPI and pixel dimensions are positive. A computed
dimension of `0` is rejected with `geometry.empty_canvas`; the engine never emits a zero-sized
raster. This is the only integer rounding in the geometry; the rule, the supplied PPI and DPI
values, and the resulting dimensions are recorded in the snapshot. A test pins the expected
dimensions for non-integer ratios and for values just below, at and just above an exact half.

**Dot shapes.** v1 validates `round`, `elliptical` and `square`. Each shape has a declared spot
function normalized to [0, 1]. The exact spot functions are an implementation detail for
`to-tickets`, but the contract requires that, for a fixed geometry, the marked dot area grows
monotonically with the reproducible tonal value. This is a property of the thresholding
procedure, not an assumption about TRC output monotonicity.

**Sampling.** Each cell's input tonal value is obtained by deterministic area-coverage sampling
over the cell's footprint in input space. The reference method is exact overlap-area weighting
against the intersected input pixels. A declared supersampling approximation is allowed only if
it meets the same tolerance on the sampling tests. When the cell footprint is smaller than one
input pixel, the value of the input pixel containing the cell centre is used, and this fallback is
recorded. Sampling is independent of output resolution.

**Thresholding.** For each output pixel, the engine computes the pixel centre's position inside its
cell, evaluates the spot function at that normalized position, and marks the pixel when the
reproducible tonal value exceeds the threshold. The comparison rule (strict or inclusive) is fixed,
documented and covered by a boundary test. Output is binary per pixel per channel. The
screening-result value of a cell is the fraction of marked output pixels in its visible footprint.

**Sub-pixel precision.** Lattice placement, angle rotation, cell-index computation and per-pixel
cell coordinates are computed in double precision and maintained until the final rasterization
decision. No intermediate geometry value is rounded to an integer; the threshold decision uses the
sub-pixel position, never a pre-rounded cell index.

**Tile and block consistency.** Processing the same input as one image or as tiles/blocks must
produce byte-identical rasters, identical stage summaries and an identical snapshot. The global
lattice, fixed phase, edge-clamp boundary policy and order-independent accumulation are what make
this true. A test compares whole-image and tiled runs and asserts byte identity.

### 8. Resolution, frequency and addressability

PPI, DPI and LPI keep their domain meanings: PPI belongs to the image, DPI to the output device,
LPI to the screen. The engine never accepts a generic "resolution" field and never performs an
implicit unit conversion.

The request supplies the output DPI; the profile may constrain allowed values. Output DPI and LPI
must be positive and finite, and `output DPI / LPI` must be positive and finite.

**Output addressability check.** When `output DPI / LPI` is below a profile-declared minimum
cell-pixel count, the engine emits a `geometry.insufficient_addressability` warning. This check is
about the output raster's ability to represent the cell geometry. There is no universal minimum:
the threshold belongs to the profile.

**Input sampling check.** When the profile declares a minimum input-samples-per-screen-line value,
the engine compares `input PPI / LPI` against it and emits an `input.low_resolution` warning when
the ratio is below the declared threshold. This is a sampling-adequacy heuristic owned by the
profile, not a universal physical limit and not a statement about the process. If the profile
declares no threshold, no low-resolution warning is emitted. The engine records the computed ratio
and the declared threshold. This check is independent of the output DPI/LPI addressability check:
one concerns the input's sampling density, the other the output raster's geometric representation.

When two channel bindings share the same angle, the engine emits a `geometry.duplicate_angle`
warning. It does not attempt moiré detection or correction in v1.

**Addressability definition.** Addressability is the number of distinct digital tonal coverages
that binary rasterization can produce for a given geometry and spot function. The engine reports,
per channel, the set and count of these coverages, derived by enumerating the actual thresholding
result for the active geometry and spot function. The report distinguishes three separate concepts:

- **Digital addressable coverages** — the distinct marked-area fractions the binary raster can
  produce. This is a property of the rasterization, not of the physical process.
- **Requested tonal values** — the commanded and corrected values carried by the input and the
  TRC. These are continuous values quantized to the declared tonal precision.
- **Physically reproducible values** — out of scope. The engine does not infer them, does not
  derive them from `output DPI / LPI`, and does not derive them from the number of pixels per cell.

The engine also reports the nominal `cell_pixel_count` separately from the
`addressable_coverage_count`; sub-pixel placement and the spot function can make them differ.
Neither value is used to cap or inflate the tonal range, and no hardcoded `cell pixels + 1` formula
is used.

### 9. Output result and snapshot

A completed result contains:

- one binary raster per ink channel at the output DPI;
- per-channel metadata: role, data kind, separation transform identity, effective frequency,
  angle, dot shape, sampling rule, stage summaries and addressability report;
- an immutable snapshot;
- typed warnings and informational issues;
- an optional stage trace.

The snapshot records the effective parameters needed to reproduce and interpret the result:

- engine version and quantisation rule;
- profile identity, declared profile version and a canonical hash of the effective parameters;
- process kind and screening method;
- output DPI and LPI;
- input dimensions, PPI, bit depth, channel layout, ICC identity when present, source kind, and the
  computed input samples per screen line with the declared minimum when applicable;
- output canvas dimensions, the rounding rule used, and the supplied PPI/DPI values;
- lattice origin and phase, basis and angular convention, pixel-centre convention, and boundary
  policy;
- separation transform descriptors: identity, version, type, the effective role mapping, matrix
  coefficients and transfer-function points, their canonical hash, ICC source and destination
  profile identities, embedded profile bytes or a content-addressed immutable artifact reference,
  rendering intent, black-point compensation, parameter hash, and hash algorithm;
- per channel: role, data kind, separation transform identity, frequency, angle, dot shape,
  sampling rule, TRC control points and interpolation (or identity), limits (`a_wf`, `a_vf`) and
  their remap semantics (or identity), `cell_pixel_count` and `addressable_coverage_count`
  separately;
- any explicit override acknowledgments, including the prepared-artwork override;
- preview flag and effective preview resolution when applicable.

**Self-containment.** The snapshot embeds every effective parameter value needed to reproduce the
result. A hash identifies content; it never replaces the content. For a channel-preserving mapping
the snapshot embeds the role mapping and the per-channel transfer-function control points and
interpolation. For declared linear mixing it embeds the coefficient matrix. For an ICC transform it
embeds the source and destination profile bytes, or a content-addressed immutable artifact stored
with the snapshot, and verifies the recorded hash on reconstruction. A path or reference to an
editable external file is not sufficient. If the profile bytes cannot be captured, the run is
rejected with `separation.unreproducible_transform`.

**Canonicalisation.** The canonical form is versioned. Keys are sorted by Unicode code point;
encoding is UTF-8; insignificant whitespace is absent; numbers are encoded as the 16 hexadecimal
digits of the IEEE-754 binary64 bit pattern in big-endian order prefixed by `0x`; binary payloads,
including ICC profile bytes, are encoded as standard case-preserving base64 (RFC 4648 section 4)
without line breaks; locale, timestamps, paths and host identifiers are absent. Case is preserved
because base64 is case-sensitive: folding it to lowercase is not injective, so `0x00` and `0x68`
would both encode as `aa==` and two distinct payloads would share one canonical record, defeating
content addressing. The same effective parameters produce the same
canonical bytes and the same hash on every run. The hash algorithm and canonicalisation version are
recorded; SHA-256 is the v1 algorithm. A golden test pins one canonical byte sequence and its hash.

The snapshot contains no wall-clock timestamp, no absolute path, no host identifier and no raster
payload. It is immutable from the caller's perspective: later mutations of the input profile or
request must not change it. Given the snapshot and the same input bytes, every effective parameter,
including separation provenance, must be reconstructable without the editable profile and without
any mutable external file. Re-running with the reconstructed parameters in the declared numeric
environment produces identical output. A test mutates or removes the profile after a run and
asserts that the snapshot, its interpretation and a re-run remain unchanged.

### 10. Warnings and validation

Every issue has a stable machine-readable code, a severity (`error`, `warning`, `info`), a scope
(`input`, `profile`, `channel`, `geometry`, `separation`, `output`, `preview`) and a message.
Errors produce `rejected`; warnings allow `completed`; informational issues are diagnostic.

Representative error conditions:

- input is not continuous tone, or PPI is missing;
- unsupported bit depth or channel layout;
- unsupported separation mode;
- implicit or undeclared separation conversion;
- separation matrix with wrong dimensions or non-finite coefficients;
- separation transform without reproducible provenance;
- unsupported screening method;
- missing or invalid AM parameter;
- unknown dot shape;
- invalid reproduction limits, including `a_wf >= a_vf`;
- ambiguous TRC control points;
- non-positive or non-finite resolution or frequency;
- channel count or role mismatch with the profile;
- missing mask source for a mask channel;
- a computed canvas dimension of zero (`geometry.empty_canvas`);
- an ICC transform whose profile bytes cannot be captured for the snapshot
  (`separation.unreproducible_transform`).

Representative warning conditions:

- prepared-artwork override used;
- no reproduction limits configured (identity);
- non-monotonic TRC output (informational);
- insufficient output addressability for the declared minimum;
- duplicate channel angles;
- input sampling ratio below the profile-declared minimum (`input.low_resolution`);
- mesh declared without a validated mesh-to-LPI relation;
- preview requested;
- a boundary cell's trace was computed over its clipped footprint.

No unvalidated parameter combination may pass silently: every combination that the engine cannot
prove valid produces at least a warning, consistent with domain rule R4.

### 11. Preview

Preview is an explicit mode, not a separate algorithm. It reuses the same input validation,
separation, tonal chain, geometry, sampling and thresholding logic with a reduced effective output
DPI, expressed as a declared integer divisor of the output DPI or as a target preview DPI.

A preview result is flagged `preview: true`, records its effective preview resolution in the
snapshot, and cannot be accepted by the output/export contract as a production result. Preview
must not allocate full-resolution rasters. It is deterministic, shares the same warning taxonomy,
and adds an informational preview issue.

### 12. Cancellation

The request may carry a cooperative cancellation token. The engine checks it at least once per
output row per channel and returns `cancelled` with no rasters and no snapshot when cancelled. The
number of checks is bounded by output rows times channels. Cancellation must not corrupt
caller-provided buffers, must leave no global state, and must be deterministic for a token that
cancels after a fixed number of checks.

### 13. Performance and memory

Performance and memory are specified as measurable requirements, not as absolute wall-clock
numbers tied to unnamed hardware:

- **Scaling.** Processing time must scale with output pixel count per channel and with input pixel
  count for sampling, with no accidental quadratic behaviour. A scaling test quadruples output
  pixels and asserts that elapsed time does not exceed six times the smaller run, allowing constant
  overhead.
- **Memory.** Peak additional memory must not exceed the input bytes plus the output bytes plus a
  declared per-row or per-tile bound. No stage may keep a full-image intermediate copy beyond that
  bound. A benchmark harness records peak memory for the declared fixtures.
- **Fixtures.** The benchmark covers at least 1, 4 and 16 megapixels, 1, 4 and 8 channels, and 8-
  and 16-bit input, using synthetic continuous-tone images.
- **Baseline.** The first implementation records a baseline on a declared reference environment.
  Later changes are compared against that baseline with a relative regression threshold; the
  absolute budget is not invented before the baseline exists.
- **No hidden caches.** Any cache is caller-owned. The engine keeps no global cache that grows
  with the number of images or jobs.

### 14. Determinism and architecture boundary

The engine is pure and deterministic: the same input bytes, profile and request produce
byte-identical rasters, stage summaries and snapshots on the same runtime and the declared numeric
environment. That environment is IEEE-754 binary64 arithmetic with round-to-nearest-ties-to-even,
no fused-multiply-add contraction, no platform-dependent transcendental functions unless a
deterministic approximation is declared, and the same engine version. The engine does not read
clocks, does not use randomness for AM, and does not depend on ambient locale or environment.

Byte identity is not claimed across architectures, runtimes, compilers, CPU instruction sets or
engine versions. Cross-runtime comparison uses the declared geometric and tonal tolerances; a
runtime that cannot provide the declared numeric environment is outside the byte-identity
contract. Public contracts are typed, strict and free of `any`. The architecture-boundary rule
remains in force: no engine file may reference the Photoshop or UXP host, the DOM, the filesystem,
the network or plugin storage.

## Testing Decisions

### Seams

One new seam is proposed: the pure engine public entry described in Implementation Decision 1.
Every acceptance test drives that seam — input validation, separation, profile validation, tonal
chain, geometry, thresholding, result, snapshot, warnings, preview, cancellation and performance
harness. Profile validation is exercised through the same seam in v1; a separate validation seam
is deferred until a second consumer (Calibration Lab or Preflight) needs it.

This is the highest seam available and keeps the new surface to one. Existing seams are reused:
the pure-engine unit-test pattern and the architecture-boundary test.

### What makes a good test

Tests assert external behaviour only: outcome status, issue codes and severities, per-channel
raster values, snapshot fields, stage-trace values and cancellation status. They do not assert
internal function names, buffer layouts or private helpers. Fixtures are deterministic and
synthetic; no host, DOM, filesystem or network is used. Golden files are limited to small
deterministic fixtures, and table-driven cases replace property-based libraries so that no test
dependency is added.

### Modules tested

- Halftone engine: geometry, sampling, thresholding, tonal chain, result assembly.
- Color engine separation contract, if implemented in this scope: channel-preserving mapping,
  declared linear mixing and injected ICC converter with a deterministic fake; transform provenance
  validation and per-channel transform identity.
- Production profile validation by process kind and method.
- Result and snapshot serialization, immutability and reproducibility.
- Warning taxonomy and issue codes.
- Preview flag and reduced-resolution path.
- Cancellation bounds.
- Performance and memory benchmark harness.

### Prior art

- The pure validation style of the existing configuration tests: a value in, a result plus an
  issue list out.
- The architecture-boundary test, which already scans every engine file for host imports.
- The existing engine boundary rules: pure, deterministic, no DOM, no I/O.

### Fixtures

Flat tonal patches, linear and stepped gradients, two-tone patches for area-coverage sampling,
non-integer DPI/LPI ratios, non-integer canvas-dimension ratios, 1/4/8-channel profiles, grayscale
and RGB input, 8- and 16-bit input, 1-bit and pre-separated prepared-artwork samples, ambiguous TRC
control points, invalid limits, duplicate channel angles, insufficient addressability, transforms
with and without provenance, and a cancellation token that fires after a fixed number of checks.
One fixture is processed whole and in tiles to assert byte identity. All profile values are declared
in the fixture; none is a physical preset.

## Acceptance Criteria

1. A continuous-tone RGB or grayscale 8/16-bit input with explicit PPI is accepted; a missing PPI
   or an unsupported layout is rejected with a stable issue code.
2. A binary, pre-separated or pre-screened input is rejected with a prepared-artwork issue; an
   explicit override is recorded in the snapshot and carries a warning.
3. Separation admits only the declared modes: channel-preserving mapping, declared linear mixing,
   and an injected ICC transform. Implicit RGB-to-CMYK or RGB-to-N conversion is rejected; a matrix
   with wrong dimensions or non-finite coefficients is rejected; a count or role mismatch is
   rejected; CMYK is not assumed.
4. A `white` channel with data kind `mask` requires an explicit mask source; a missing source is
   rejected; automatic DTF white generation is absent; the channel's separation transform identity
   is recorded.
5. An AM profile missing frequency, angle or dot shape is rejected; a non-AM method is rejected as
   unsupported; no physical default is substituted.
6. The four tonal stages are observable through the stage trace; identity TRC and identity limits
   are recorded as stages, not skipped.
7. A TRC is applied deterministically; control points are preserved in the snapshot; ambiguous
   control points are rejected; non-monotonic output is diagnostic, not blocking.
8. Limits are applied after the TRC with the approved linear remap: `a_corrected <= a_wf` gives 0,
   `a_corrected >= a_vf` gives 1, and the interval is interpolated. `a_wf` and `a_vf` are normalized
   to [0, 1] with `a_wf < a_vf`; invalid ranges are rejected; `a_commanded` and `a_corrected` are
   preserved; `a_reproducible` is an independent stage; absent limits are identity with an
   informational warning.
9. For a non-integer `output DPI / LPI` ratio, the measured frequency and angle stay within the
   declared tolerance, and changing output DPI does not change the cell's physical size; the
   lattice origin, phase and basis are the declared global ones.
10. No intermediate geometry value is rounded to an integer; the only integer rounding is the
    output canvas dimension, computed as `floor(x + 0.5)` on non-negative values, recorded with the
    supplied PPI/DPI values, and a computed dimension of zero is rejected as
    `geometry.empty_canvas`.
11. Sampling returns the patch value on a flat patch and the area-weighted value on a two-tone
    patch, within one tonal quantisation step.
12. Dot area grows monotonically with the reproducible value for a fixed geometry; an unknown dot
    shape is rejected.
13. Addressability is reported as the number of distinct digital tonal coverages the binary
    rasterization can produce for the active geometry and spot function, derived from the actual
    thresholding; it is distinct from requested tonal values and from physical reproduction, and
    no physical levels are inferred from DPI/LPI or cell pixels.
14. Insufficient output addressability, a duplicate channel angle, an input sampling ratio below
    the profile-declared minimum, and a declared mesh without a validated relation each produce
    the specified warning; the input-sampling warning is distinct from the output DPI/LPI check.
15. A completed result contains one binary raster per channel at the output DPI plus the snapshot;
    a rejected result contains no rasters; a cancelled result contains no rasters and no snapshot.
16. The snapshot embeds the effective parameter values, not only their hashes: role mapping,
    transfer functions, matrix coefficients, TRC points, limits, lattice and boundary conventions,
    and the addressability distinction; it excludes timestamps, paths and host identifiers and is
    immutable against later profile or request mutations.
17. Given the snapshot and the same input bytes, every effective parameter and the separation
    provenance are reconstructable without the editable profile and without any mutable external
    file; an ICC transform embeds its profile bytes or a content-addressed immutable artifact
    verified by hash; re-running produces identical output in the declared numeric environment.
18. Preview is flagged, records its effective resolution, uses the same pipeline, allocates no
    full-resolution rasters and cannot be accepted as output.
19. Cancellation is checked at least once per row per channel, returns `cancelled` with no partial
    result, and leaves no global state.
20. The benchmark records time and peak memory for the declared fixtures and passes the scaling
    and memory-bound checks.
21. The engine is deterministic on the same runtime, contains no host, DOM, I/O or randomness for
    AM, and the architecture-boundary test still passes; whole-image and tiled processing produce
    byte-identical rasters, stage summaries and snapshots.
22. `npm run check` exits 0 with the new tests, and `npm run build` still exits 0.
23. A separation transform that cannot supply a stable identity and the required provenance is
    rejected; every produced channel records the transform that produced it.
24. The input low-resolution warning is emitted only when the profile declares a minimum input
    samples per screen line; no universal PPI/LPI threshold is applied, and the basis is recorded.
25. Cell indexing uses `floor` on inverse-basis coordinates, so negative coordinates yield negative
    indices with `alpha` and `beta` in `[0, 1)`; truncation toward zero is absent, and a cell
    reached from a negative coordinate matches the same cell reached from a positive offset.
26. Edge-clamp replicates border pixels and coverage weights sum to the cell area for footprints
    extending beyond any input side; a clipped cell reports `clipped: true` with `marked / visible`
    over the canvas-clipped footprint, and a cell with zero visible pixels is not evaluated.
27. Canonicalisation is versioned, key-sorted, locale-free and timestamp-free; the same effective
    parameters produce the same canonical bytes and hash, and a golden test pins them.
28. Byte identity is claimed only for the same runtime and declared numeric environment;
    cross-runtime comparison uses the declared tolerance and no universal binary equivalence is
    asserted.

## Open Decisions

No product-level open decisions remain. OD1 and OD2 were resolved during the conditional approval:

- **OD1 = C — declared mapping mandatory, ICC transform optional.** The separation contract now
  defines the admitted mappings and the rejected ones, and requires reproducible transform
  provenance per channel.
- **OD2 = A — linear remap between `a_wf` and `a_vf`, clamped at both ends.** The reproduction
  section now records the exact boundaries, validation and stage independence.

The following are deferred implementation choices, not open product decisions: the exact spot
function definitions and lookup-table resolution, the internal tile size and data layout, the
reference environment used for the performance baseline, and the calibration data that will
populate TRC and limit values. They do not block marking the spec `ready-for-agent`.

## Risks

1. **Separation provenance.** An opaque ICC transform or an undeclared mapping could make a result
   look reproducible when it is not. Mitigation: reject transforms without stable identity and
   provenance; record the descriptor per channel; test the rejection path.
2. **Sub-pixel cost.** Per-pixel spot-function evaluation with fractional cell placement can be
   slow. Mitigation: precompute a deterministic spot-function lookup table at a declared resolution
   and verify it against the reference evaluation.
3. **Cross-runtime floating-point drift.** Geometry may differ in the last bits. Mitigation:
   byte-identical output on the same runtime, tolerance-based geometry tests across runtimes, and no
   platform-dependent transcendental functions without a declared approximation.
4. **Snapshot growth.** A snapshot that copies too much becomes a second profile store. Mitigation:
   record effective parameters and a canonical hash, never history or rasters; test the snapshot
   bound.
5. **Prepared-artwork false negatives.** Screening a pre-screened image is destructive. Mitigation:
   conservative detection, explicit source-kind declaration, an override that is recorded and
   warned, and fixtures for each detection signal.
6. **TRC ambiguity.** Non-monotonic or duplicate control points can make the mapping undefined.
   Mitigation: reject ambiguous inputs; keep output monotonicity as a diagnostic until validated.
7. **Memory blow-up.** Large images with many channels can exceed the bound. Mitigation: per-channel
   raster allocation, no full-image stage copies, and a benchmark that measures peak memory.
8. **Preview divergence.** A preview path that drifts from the output algorithm would mislead the
   operator. Mitigation: one shared pipeline, an explicit preview flag, and tests that compare the
   preview and output geometry logic.
9. **Scope creep.** FM, hybrid, spot rules, DTF physics and mesh simulation are tempting. Mitigation:
   the scope boundary and the out-of-scope list are part of the spec; unsupported methods are
   rejected, not approximated.
10. **Missing calibration data.** TRC and limit values cannot be invented. Mitigation: the engine
    ships mechanics with profile-supplied values and identity fallbacks; calibration is a separate
    workflow.
11. **Golden-test brittleness.** Full-image goldens are fragile. Mitigation: small deterministic
    fixtures plus table-driven assertions on observable values.
12. **Canvas rounding.** Integer canvas dimensions slightly change the physical output size.
    Mitigation: one declared rounding rule, recorded in the snapshot, and a test that asserts it.
13. **Input-resolution warning misread as a physical limit.** Mitigation: the warning is emitted
    only from a profile-declared threshold, is labelled a sampling-adequacy heuristic, and is kept
    separate from output addressability.
14. **Lattice phase or tile drift.** Mitigation: one global lattice with fixed phase and an
    edge-clamp boundary policy; a whole-image versus tiled byte-identity test.
15. **Snapshot size from embedded ICC profiles.** Embedding profile bytes can make snapshots large.
    Mitigation: a content-addressed immutable artifact stored with the snapshot, a recorded size
    bound, and a hash check on reconstruction.
16. **Canonicalisation drift.** A changed canonical form silently changes hashes. Mitigation: a
    versioned canonicalisation rule and a golden byte/hash test.

## Dependencies

- The committed domain model and ADRs 0001–0010.
- The color engine's separation contract, with OD1 resolved as declared mapping mandatory plus an
  optional injected ICC transform.
- The shared production-profile schema and the validation issue model.
- The existing architecture-boundary test and engine boundary rules.
- The test fixture set and the performance/memory benchmark harness.
- A declared reference environment for the performance baseline.
- Future calibration data for meaningful TRC and limit values; it does not block the mechanics.
- No new runtime dependency and no code change during `to-spec`.

## Out of Scope

- FM implementation. FM remains documented as first-class but is not built in v1.
- Hybrid screening, which has no verified definition in this project.
- Spot-colour screening rules. Generic AM applies to every tone channel; no special rules are
  implemented.
- Mesh physical simulation and any mesh-to-LPI formula. Only a warning is emitted.
- Predictive mechanical or Yule–Nielsen gain models. v1 compensates with TRC only.
- Universal CMYK angle presets, LPI ranges, DTF values, choke or expansion values.
- DTF white generation, coverage, film behaviour and physical parameters.
- UI, module wiring, Photoshop host integration, file I/O and export formats.
- Calibration workflow and measurement.
- Moiré detection or correction beyond the duplicate-angle warning.
- Multi-threading, workers, persistence and caching owned by the engine.

## Further Notes

- The spec uses the vocabulary of `GLOSSARY.md`; PPI, DPI and LPI are never interchangeable, and
  "resolution" is never used without a unit.
- The spec deliberately contains no physical values. Every angle, frequency, limit, TRC point,
  minimum cell-pixel count and minimum input-samples-per-screen-line value is supplied by a profile
  or a fixture. The only numbers in this document are technical quantisation and benchmark
  parameters, test tolerances and structural bounds, not physical process values.
- The domain remains incomplete by design. This spec covers the AM core only and does not claim
  that hybrid, spot rules, mesh-to-LPI, CMYK angles or DTF physics are settled.
- Revision 2 incorporates the conditional approval: OD1 = C, OD2 = A, plus the geometry,
  addressability and resolution precision requested by the owner, and the three final controls
  (exact boundary definitions, scoped determinism, self-contained snapshot). It is approved and
  `Status: ready-for-agent`.
- No code, manifest, adapter, test or dependency was modified while producing this spec.

## Recommendation: to-tickets

Proceed to `to-tickets` now that this revision is approved. OD1 and OD2 are resolved; no
product-level decision blocks the split. Split the work into reviewable units in this order:

| #   | Ticket                                                            | Depends on       | Acceptance signal                                       |
| --- | ----------------------------------------------------------------- | ---------------- | ------------------------------------------------------- |
| 1   | Shared profile, channel, TRC, limit and issue types               | —                | Typed contracts compile; validation tests pass          |
| 2   | Input contract and prepared-artwork detection                     | 1                | Input acceptance and rejection tests pass               |
| 3   | Separation contract (declared mapping, optional ICC transform)    | 1 (OD1 resolved) | Channel-set, provenance and separation tests pass       |
| 4   | Tonal chain: TRC, limits, four-stage trace                        | 1 (OD2 resolved) | Stage, remap and limit tests pass                       |
| 5   | AM geometry: lattice, angle, sub-pixel placement                  | 1                | Frequency and angle tolerance tests pass                |
| 6   | Sampling and thresholding for the three dot shapes                | 5                | Sampling and monotonic dot-area tests pass              |
| 7   | Result assembly, snapshot and reproducibility                     | 2–6              | Snapshot immutability and reconstruction tests pass     |
| 8   | Warning taxonomy and validation integration                       | 1–7              | Every warning and error code is asserted                |
| 9   | Preview mode                                                      | 7                | Preview flag, resolution and no-full-raster test pass   |
| 10  | Cancellation                                                      | 7                | Bounded-check and no-partial-result tests pass          |
| 11  | Performance and memory benchmark                                  | 7                | Scaling and memory-bound checks pass; baseline recorded |
| 12  | Engine seam integration tests and architecture-boundary extension | 1–11             | End-to-end seam tests pass; `npm run check` exits 0     |

Each ticket is a work unit with its tests, keeps the engine pure, and adds no physical preset. UI
and module wiring start only after the engine seam is stable.
