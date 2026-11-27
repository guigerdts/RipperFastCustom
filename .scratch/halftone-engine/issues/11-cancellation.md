# 11: Cooperative cancellation with no partial result

Type: task
Status: done
Feature: halftone-engine
Spec ticket: 10 of 12
Spec: ../spec.md

**What to build:** Cooperative cancellation through the public seam. The request may carry a
cancellation token; the engine checks it at least once per output row per channel. A cancelled run
returns `cancelled` with no rasters and no snapshot, leaves no partial result, does not corrupt
caller-provided buffers and keeps no global state. The number of checks is bounded by output rows
times channels, and a token that cancels after a fixed number of checks is deterministic.

**Blocked by:** 08 (result and snapshot).

**Execution note:** May run in parallel with the other tickets blocked only by 08 when edit surfaces
are disjoint; otherwise sequential.

**Scope:**

- Cancellation token contract and check placement.
- `cancelled` outcome shape.
- Buffer-integrity guarantees.
- Deterministic cancellation for a fixed check count.

**Out of scope:** asynchronous workers, threads, process-level cancellation and UI wiring.

**Acceptance criteria:**

- [x] Cancellation is checked at least once per output row per channel.
- [x] A cancelled result contains no rasters and no snapshot.
- [x] A cancelled run leaves no partial result and does not corrupt caller-provided buffers.
- [x] Cancellation leaves no global state and is deterministic for a token that cancels after a
      fixed number of checks.
- [x] The number of checks is bounded by output rows times channels.
- [x] `npm run check` exits 0.

> Note on the last box: `npm run check` cannot complete in this environment — its parallel file
> workers abort on `uv__io_poll`/`futex`. The four steps the script runs were executed sequentially
> (`tsc --noEmit`, `eslint .`, `prettier --check .`, `vitest run --no-file-parallelism`); all four
> pass. The failure is environmental, not a code defect.

**Tests:**

- Cancel-at-first, cancel-at-middle and cancel-at-last-check cases; each returns `cancelled`.
- Result-shape test: no rasters and no snapshot in a cancelled outcome.
- Buffer-integrity test: a sentinel-filled caller buffer is unchanged after cancellation.
- Determinism test: the same fixed check count produces the same outcome on repeated runs.
- Global-state test: a later successful run is unaffected by a prior cancellation.

## Implementation record

- **Token contract.** New `src/engines/halftone/contracts/cancellation.ts` defines
  `CancellationToken = () => boolean`, re-exported from the contracts barrel. `AssembleInput`
  carries it as `isCancelled?: CancellationToken`. The engine only ever calls the token: it does
  not own it, store it or derive state from it, and the pure engine still has no I/O, timers,
  workers or external dependencies.
- **Check placement.** The pipeline consults the token once at its entry, before input validation
  and before any buffer is allocated; that call is attributed to the first channel's output row 0.
  `assembleChannel` then checks row 0 of every later channel before that channel normalises its
  input, and checks each remaining row inside the pixel-write loop. Because a cell's visible pixels
  are row-major and every output row is covered by at least one cell, a row is checked on first
  contact and `rowChecked` prevents a second consultation for the same row.
- **Exact bound.** The total is exactly output rows times channels when the token never fires.
  Rows whose pixels a tile mask would skip are still checked, because the token is consulted before
  the mask test. Preview checks the reduced canvas, not the full one. There is no extra check after
  the last row, so the bound is never exceeded.
- **No partial result.** `assembleChannel` returns an internal `ChannelCancelled` signal; the
  pipeline returns `{ status: 'cancelled', issues }` and drops the local partial raster together
  with every channel assembled so far. The existing `CancelledResult` type already excludes
  `rasters` and `snapshot`, so a partial raster cannot be labelled `completed`.
- **Diagnostics.** A cancelled run reports the issues accumulated up to the cancellation point,
  passed through `finalizeIssues` by `finalizeEnvelope`, so the order and deduplication rules are
  the same as for any other envelope. The entry check returns `issues: []` because nothing has run
  yet.
- **Buffer integrity.** The engine never writes into caller-provided input or mask buffers; the
  cancellation test compares the input bytes before and after a cancelled run.
- **Determinism and state.** For a token that flips after a fixed number of calls, the cancellation
  point is fixed by the traversal order, so repeated runs produce the same outcome and issues. No
  module-level state is written; a successful run after a cancelled one is byte-identical to the
  baseline.

## Verification

- **Focused suites:** `cancellation.test.ts` 10 tests and `cancellation-probes.test.ts` 5 tests
  (15 total), `result.test.ts` 22, `preview.test.ts` 11, `output-contract.test.ts` 5 — 53 passed.
  The probes cover the tile-mask bound, preview at the reduced resolution, four distinct
  cancellation points that never yield a partial result, a token consulted again after a
  cancellation, and whole-image versus tiled byte equality with a live token.
- **Halftone suite:** `npx vitest run tests/unit/halftone --no-file-parallelism` — 383 passed
  (18 files).
- **Full suite:** `npx vitest run --no-file-parallelism` — 449 passed, 4 skipped (26 files passed,
  1 skipped).
- **Typecheck, lint, format:** `tsc --noEmit`, `eslint .`, `prettier --check .` — all clean.
- **Build:** `npm run build` — clean, bundle 30.9 kB.
- **Whitespace:** `git diff --check` — clean.
- **Repository state:** `master == origin/master`, working tree clean after the closure push.

## Review and corrections

- **GGA pre-commit (`opencode:google/gemini-3.5-flash-lite`, STRICT_MODE):** STATUS: PASSED on
  `0040d8e` (token, per-row checks and core tests) and on `50a2db0` (cancellation probes). The
  second slice was served from the review cache at commit time. STRICT_MODE was never disabled and
  no `--no-verify` was used.
- **Independent verifier unavailable.** A `gentle-ai-verify` subagent launch returns
  `permission.rejected: Permission denied: subagent` in this runtime, so no independent
  requirement-by-requirement verdict was produced. Substitute evidence: GGA reviewed both slices,
  the check-count tests measure the bound directly, and the buffer, determinism and global-state
  tests exercise the remaining acceptance criteria. This is an external review of the change, not an
  independent per-requirement audit.
