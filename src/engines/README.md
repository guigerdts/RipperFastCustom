# Engines

Pure, host-independent processing kernels. The engines are the part of
RipperFastCustom that does the actual image mathematics.

## Boundary rules

1. **No Photoshop imports.** An engine never calls `require('photoshop')`,
   `executeAsModal`, or any adapter. Host access belongs to `src/adapters`.
2. **No DOM access.** Engines must run in Node during unit tests.
3. **No I/O.** Reading or writing files, networks, or plugin storage is out of
   scope for an engine.
4. **Deterministic.** Same input, same output — no clocks, no randomness unless
   seeded by the caller.
5. **Typed and small.** Public functions take explicit inputs and return
   explicit outputs; no `any`.

Directories are created ahead of their implementation on purpose: each one
documents the area it will own, and gains code only when the corresponding
module is scheduled. Empty contracts are not written speculatively.
