# Halftone cell is geometric, not a pixel block

A halftone cell is defined by its physical side, 1/LPI inch, and only represented in output
pixels as DPI/LPI. That ratio is nominal and may be fractional, so the engine must support
sub-pixel cell placement instead of rounding.

**Considered options**: integer pixel cells (rejected — rounding silently changes the requested
frequency or angle, and the geometry must keep its physical meaning when output resolution
changes).
