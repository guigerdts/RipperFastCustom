# Staged UXP compatibility: one source, two manifests

RipperFastCustom must load from Photoshop 22.0 (2021) onward, but the real
halftone flow needs `executeAsModal`, which Adobe documents as available only to
plugins declaring `apiVersion: 2`, and the Imaging API, which appears in
Photoshop 24.2 (beta) / 24.4 (stable). `apiVersion` is a single static manifest
value and `host` cannot be an array in a distributed package.

The product therefore ships the **same code** under **two manifests with the same
plugin id and disjoint host ranges**: a legacy build (`apiVersion: 1`,
`22.0 – 24.3`) that loads everywhere and reports the halftone flow as unavailable
with the exact missing capability, and a modern build (`apiVersion: 2`,
`24.4+`) that runs the full flow. Runtime capability detection decides what is
enabled; no pixel work is ever simulated.

**Considered options**: one manifest declaring `apiVersion: 2` with
`minVersion 22.0` (rejected — the load behaviour of a v2 declaration on a host
with no modal implementation is undocumented, so the 22.0 guarantee would rest on
an assumption); a single `apiVersion: 1` package doing pixel I/O through
`batchPlay` and temporary TIFF files (rejected — adds a filesystem permission
prompt, a hand-written binary codec and a disk round trip, see
`docs/compatibility-uxp.md` §5); two different plugin ids (rejected — duplicates
the product in the panel and the marketplace).

**Evidence**: `docs/compatibility-uxp.md`, with the Adobe sources per claim. This
supersedes the `executeAsModal` claim in `docs/DECISIONS.md` D4 and the
`apiVersion: 1`-only rule in `src/validation/manifest.ts`.
