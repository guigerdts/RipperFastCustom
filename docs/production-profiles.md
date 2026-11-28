# Production profiles

A production profile is the declarative description of how one halftone job is screened: what
output resolution it targets, which inks it prints, and how each ink's screen is placed. It is the
only input the screening engine receives besides the source raster. No form ever sends loose
parameters to the engine, and no physical preset is baked into the engine or its fixtures.

The contract lives in `src/modules/halftone-studio/profiles/`. It is host-independent: nothing there
imports `photoshop` or `uxp`, so it validates and serializes the same way in a test runner, in a
worker, or inside the plugin.

Legend: **Verified** — checked against the Adobe documentation or the engine contract in this
repository. **Decision** — a choice made here, with its reason.

---

## 1. The document

```
ProductionProfileDocument
├─ schemaVersion            1                     // the shape this build reads
├─ id                       "screen-print-cmyk"   // stable, storage-safe identity
├─ version                  "1"                  // operator-declared edition
├─ processKind              "screen-printing"    // what family of process this describes
├─ metadata                 { name, description, createdAt, updatedAt }
├─ output                   { dpi, allowedResolutions }
├─ constraints              { minimumCellPixels, minimumInputSamplesPerScreenLine }
├─ separation               channel-preserving | linear-mixing
└─ channels[]               { id, inkName, dataKind, displayColor, screening }
                            screening = { lpi, angle, dotShape }
```

Three things this shape is careful about:

- **Channels are inks, not CMYK.** `inkName` is a free string, so a spot ink or a custom
  separation is representable without a schema change. Nothing in the contract assumes four
  channels or a particular ink order.
- **DPI, LPI and the cell relation are separate checks.** `output.dpi` is an output pixel density;
  `channel.screening.lpi` is a screen frequency. Each is validated in its own unit, and the ratio
  between them (how many output pixels a screen cell actually gets) is a third, independent check.
  A valid DPI and a valid LPI can still be incompatible with each other.
- **The separation is declared, not inferred.** `channel-preserving` maps source components to
  channel ids explicitly; `linear-mixing` is a matrix with one row per tone channel. `icc` is not
  supported in schema v1 because it would require captured profile bytes, which this ticket does
  not carry.

Two data kinds exist: `tone` (an ink that carries tone) and `mask` (a channel that gates output).
A separation may only target a `tone` channel; mapping a source component onto a mask channel is a
diagnostic, not a silent no-op.

**No invented properties.** Every field either reaches the engine through the adapter or is
metadata. `displayColor` is presentational and never affects screening; `allowedResolutions`,
`minimumCellPixels` and `minimumInputSamplesPerScreenLine` are forwarded to the engine contract,
which owns their meaning.

## 2. Diagnostics

Validation returns `ProfileIssue[]`, each with a stable code, a severity (`error` rejects the
profile, `warning` does not), a document path such as `channels[2].screening.lpi`, and structured
details.

The profile keeps its **own** issue registry (`profiles/diagnostics.ts`), separate from the engine's
`ISSUE_REGISTRY`. Reason: the engine's `createIssue` rejects unregistered codes by throwing, and
adding profile codes to it would change a contract this ticket must not touch. A profile problem is
a problem with the document, not with a screening request, so it gets its own vocabulary and stays
host-independent.

Representative codes:

| Code                                 | Meaning                                                           |
| ------------------------------------ | ----------------------------------------------------------------- |
| `profile.id_invalid`                 | id is not a storage-safe identity (1–128 chars, `[A-Za-z0-9._-]`) |
| `profile.schema_version_unsupported` | unknown or newer schema version — never coerced                   |
| `profile.output_dpi_invalid`         | DPI is not a finite value above zero                              |
| `profile.dpi_not_allowed`            | DPI is not in the profile's own `allowedResolutions`              |
| `profile.duplicate_ink_name`         | two channels declare the same ink (case-insensitive)              |
| `profile.cell_too_small`             | output has less than one pixel per screen cell                    |
| `profile.minimum_cell_not_met`       | cell is above one pixel but below the declared minimum (warning)  |
| `separation.channel_map_unknown`     | the separation names an undeclared channel                        |
| `separation.matrix_row_count`        | matrix does not have one row per tone channel                     |
| `channel.dot_shape_unknown`          | dot shape is not one the engine accepts                           |

## 3. Schema versioning and migration

`schema.ts` gates the version **before any field is read**. A missing, non-integer, zero/negative,
unknown or newer `schemaVersion` is rejected with `profile.schema_version_unsupported`; it is never
inferred from another field and never coerced. Migration is an explicit chain of steps; in v1 the
chain is empty, so a v1 document passes through unchanged (`migrated: false`) and any other version
is refused rather than guessed.

## 4. Serialization

`serializeProfileDocument` writes a fixed key order with two-space indentation, so the same document
always produces the same bytes. Stored files stay diff-friendly and import/export is reproducible.
Parsing (`parse.ts`) rebuilds only the known shape, so unknown properties are dropped instead of
being carried along and silently persisted by a later write. Parse → serialize → parse is lossless
and asserted by tests.

## 5. The engine adapter

`engine-adapter.ts` is the one place a profile becomes an engine request:

- channels become engine `InkChannel`s; `inkName` becomes the engine `role`, and `lpi` becomes the
  engine `frequency` (a unit change, not a value change);
- the declared separation becomes a `SeparationDeclaration` whose `identity.parameterHash` is
  computed by the engine's own `hashCanonical` over the effective mapping. **No user-supplied hash
  is trusted**: the hash is a consequence of the declaration, so it cannot claim to describe a
  different transform;
- absent optional constraints are omitted rather than sent as `null`.

`adaptProfileToRequest` validates the profile, and when it is usable it also runs the engine's own
`validateScreeningRequest` and reports those issues tagged `stage: 'engine'`. It never throws for a
bad profile; it returns diagnostics and `ready: false`.

## 6. Persistence

Storage is split so each layer can be replaced and tested independently:

```
ProfileRepository          list / get / create / update / duplicate / remove
  └─ ProfileFileSystem     read / write / list / remove, by flat file name
       ├─ in-memory        for tests and preview runs
       └─ UXP adapter      plugin-data folder, feature-detected
```

One JSON file per profile, named `<id>.json`. Every operation returns a discriminated result
instead of throwing, so the UI can show a specific message: `not_found`, `conflict` (never
overwrite), `invalid` (with issues) and `corrupt` (a file that no longer parses, reported in
`list()` rather than hidden).

### Why not `localStorage`

**Verified:** UXP exposes `localStorage`, and it does persist across sessions, but it is bounded,
lives in a cache-like browser store, and is documented as clearable — it is scoped to the plugin's
local storage area rather than to a durable, user-owned folder.

**Decision:** profiles are user assets, not cache. They get one file each in the plugin-data folder
returned by `uxp.storage.localFileSystem.getDataFolder()`, which is documented as persisting across
plugin upgrades. Consequences:

- a profile can be exported, diffed and version-controlled by the user;
- a corrupt or hand-edited profile is visible and recoverable instead of an opaque key;
- the store survives an upgrade that clears web-style storage.

**Verified:** `getDataFolder()` requires the `localFileSystem` manifest permission. **Decision:**
this ticket does not add that permission — changing a manifest permission is its own change with its
own compatibility review. Until then `createUxpProfileFileSystem` returns `null`, the repository is
simply unavailable, and nothing pretends a store exists. Adding the permission is a follow-up
ticket; the port, the repositories and the adapter are already in place and tested.

## 7. The three-level UX (next ticket)

The profile editor is not part of this ticket, but the contract fixes what it must be able to
express. The planned interface has three levels over the same document:

1. **Basic** — pick a profile, see its name, inks, output resolution and screen ruling. Everything
   else is read-only. This is what an operator uses to print a job that already has a profile.
2. **Advanced** — edit the parts that change per job or per press: output DPI against the allowed
   list, per-ink LPI, angle and dot shape, and the separation map. Diagnostics appear inline on the
   field that caused them, using the document path.
3. **Production** — constraints, separation matrices, allowed resolutions, identity and edition,
   import/export and duplication. This is where a shop codifies a repeatable process.

Hierarchy follows the document: output and channels first, separation and constraints behind an
explicit reveal. The visual language stays the existing plugin's, not a landing page: no hero
sections, no marketing copy, no decorative gradients — dense production UI with real field-level
feedback.

Unsaved edits are staged in the form; nothing is written until the document validates without
errors, and a save through the repository reports `conflict` instead of overwriting.
