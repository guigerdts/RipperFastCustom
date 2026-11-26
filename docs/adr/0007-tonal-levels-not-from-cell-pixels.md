# Tonal levels are not derived from cell pixel count alone

The number of pixels in a cell bounds what the digital raster can address, not what the process
can physically reproduce. No universal level formula is adopted before the geometry and
screening method are studied, and every configuration must still respect the relation between
output resolution and screen frequency.

**Considered options**: the common `levels = cell pixels + 1` shortcut (rejected — it conflates
digital addressing with physical tone reproduction and would silently cap or inflate the tonal
range).
