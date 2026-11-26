# 11: Cooperative cancellation with no partial result

Type: task
Status: ready-for-agent
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

- [ ] Cancellation is checked at least once per output row per channel.
- [ ] A cancelled result contains no rasters and no snapshot.
- [ ] A cancelled run leaves no partial result and does not corrupt caller-provided buffers.
- [ ] Cancellation leaves no global state and is deterministic for a token that cancels after a
      fixed number of checks.
- [ ] The number of checks is bounded by output rows times channels.
- [ ] `npm run check` exits 0.

**Tests:**

- Cancel-at-first, cancel-at-middle and cancel-at-last-check cases; each returns `cancelled`.
- Result-shape test: no rasters and no snapshot in a cancelled outcome.
- Buffer-integrity test: a sentinel-filled caller buffer is unchanged after cancellation.
- Determinism test: the same fixed check count produces the same outcome on repeated runs.
- Global-state test: a later successful run is unaffected by a prior cancellation.
