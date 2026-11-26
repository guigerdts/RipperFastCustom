# Screen angles belong to production profiles

Concrete screen angles are never universal constants: they live in a production profile, which
owns them per process, screening method, channel count, mesh, ink and substrate. The domain fixes
only the angular reference and rotation direction.

**Considered options**: hardcoded CMYK angle sets (rejected — they are process-dependent, Adobe
Photoshop's Color Halftone values and other RIP conventions are not interchangeable, and any
conversion between conventions must be explicit).
