# Halftone engine

Pure, host-independent AM halftone generation. The engine turns a continuous
tone input plus a production profile into one 8-bit output raster per ink
channel, with a canonical snapshot that pins the run for reproduction.

Version 1 is **amplitude modulation (AM) only**: spot functions, screen angles,
frequency and cell geometry. There is no stochastic screening and no
randomness. A non-AM method is rejected as unsupported.

## Public seam

The single screening entry point is `assembleScreeningResult` in `result.ts`:

```ts
import { assembleScreeningResult } from './result';
```

It takes an `AssembleInput` (`request`, optional `iccConverter`, `maskSources`,
`tiles`, `isCancelled`) and returns a `ScreeningResult` with one of three
outcomes: `completed`, `rejected`, or `cancelled`. Only a `completed` run owns
rasters and a snapshot; a rejected or cancelled run owns diagnostics only, so
no partial raster escapes.

Consumers should not deep-import individual stages. The public contract surface
is barrel-exported from `contracts/index.ts`:

```ts
import type { ScreeningRequest, ScreeningResult } from './contracts';
```

## Pipeline

`assembleScreeningResult` runs the stages in a fixed order. Each stage is pure
and independently testable.

1. **Input gate** (`input.ts`) — validates the continuous tone input: layout,
   bit depth, dimensions and PPI.
2. **Request validation** (`contracts/validation.ts`) — validates the profile
   contract, the mesh declaration, the output DPI value and its allowed
   resolutions, and the sampling ratios. A DPI that is not a finite positive
   number is reported as `output.invalid_resolution`, distinct from a usable DPI
   the profile does not allow (`output.unsupported_resolution`).
3. **Separation** (`separation.ts`) — converts the input into one tonal plane
   per ink channel.
4. **Tonal chain** (`tonal.ts`) — applies the channel's tone reproduction curve
   and limits. A single rounding rule (`floor(x * 65535 + 0.5)`) is used
   throughout.
5. **Geometry** (`geometry.ts`) — computes the output canvas and the sampling
   lattice. The lattice is anchored in input space, so tiles never re-anchor a
   screen phase.
6. **Screening** (`screening.ts`) — samples each cell and rasterizes it with the
   channel's spot function. Addressability is derived from the actual
   thresholding, not from DPI/LPI arithmetic.
7. **Assembly** (`result.ts`) — writes the per-channel rasters through an
   optional tile write mask, builds per-channel metadata and seals the snapshot.

## Snapshot and reproducibility

`snapshot.ts` and `canonical.ts` produce a canonical, versioned representation of
the parameters and a SHA-256 `snapshot.hash`. The snapshot is deep-cloned and
recursively frozen before sealing, so later mutation of the caller's request or
profile cannot reach it. `verifySnapshot` recomputes and checks the hash.

Byte identity is declared only for the same runtime and the same numeric
environment. A cross-runtime comparison is tolerance-based and never claims
universal binary equivalence.

## Tiling

`tiles` is a write selection, not a raster definition. The raster is always
full-canvas and every pixel is computed, so the values never depend on how the
canvas is partitioned; a union of tiles that covers the canvas produces exactly
the whole-image bytes.

- A tile partially outside the canvas is clipped to the canvas.
- A tile with a non-positive or non-finite extent is rejected
  (`output.invalid_dimension`).
- A tile that lies entirely outside the canvas selects no pixels. That is a
  `output.tile_beyond_canvas` warning on an otherwise `completed` run: it is
  usually an off-by-one or a coordinate-space mismatch, so it is reported rather
  than silently producing zero coverage.
- An empty tile list is a valid empty selection and produces no diagnostic.

## Cancellation

`isCancelled` is a caller-supplied cooperative token, never owned by the engine.
It is consulted exactly once per output row per channel, including rows a tile
mask would skip, so the total is bounded by output rows times channels. A `true`
result yields a `cancelled` envelope with no rasters and no snapshot. Cancellation
is synchronous; the engine never spawns work that outlives the call.

## Boundary rules

This directory is an engine and follows `src/engines/README.md`:

- no `photoshop` or `uxp` imports;
- no DOM access;
- no file, network, or plugin-storage I/O;
- no clocks and no randomness (AM screening is fully deterministic);
- typed public functions, no `any`.

These rules are enforced by `tests/compatibility/architecture-boundary.test.ts`,
not by convention.

## Memory limitation

The engine keeps full-image stage planes (separation and tonal) rather than
streaming per row or per tile. The honest declared bound is the full-image
workspace described in `docs/PERFORMANCE.md`, which also records the measured
baseline and the plan to close the gap to a streaming design. Reducing that
memory is a separate optimisation that must preserve the recorded raster hashes.
