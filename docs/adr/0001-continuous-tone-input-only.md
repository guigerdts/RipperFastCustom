# Halftone Engine accepts continuous-tone input only

The Halftone Engine processes continuous-tone rasters (RGB or grayscale, 8 or 16 bit,
ICC-profiled when available) and refuses binary, pre-separated or pre-screened images as normal
input. Those follow a separate prepared-artwork route, and the engine detects and warns instead
of screening them again, because double halftoning destroys the original information
irreversibly.

**Considered options**: one engine accepting every raster shape (rejected — it hides the
distinction that matters most to a prepress operator, and a silent second screening cannot be
undone).
