# Export engine

Encoding of engine output into deliverable formats (bitmaps, separations,
print-ready files).

Boundary: serialisation only; it must not perform colour or halftone maths,
and it must not write to disk by itself — see `src/engines/README.md`.
