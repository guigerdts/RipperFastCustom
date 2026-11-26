# RipperFastCustom — Graphics Domain

Domain vocabulary for the Graphics Core and the Halftone Engine: how a continuous-tone image
becomes a reproducible ink pattern for screen printing, DTF and CMYK processes. Terms describe
prepress reality; implementation choices are deliberately absent.

## Language

### Image input

**Continuous-tone input**:
A raster image whose pixels carry a tonal value per channel with no screening applied. The
Halftone Engine's primary input.
_Avoid_: photo, source bitmap, grayscale

**Prepared artwork input**:
A binary, mask or pre-separated image that must not pass through the halftone process again.
Handled by dedicated tools, never silently by the engine.
_Avoid_: bitmap input, pre-halftoned image, normal input

**Raster image**:
A two-dimensional grid of samples representing an image.
_Avoid_: bitmap (reserve for binary rasters), picture

**Pixel**:
One sample position in a raster image, carrying a tonal value. A pixel is not a printed dot.
_Avoid_: dot, point, screen element

### Separation and channels

**Separation**:
The transformation that maps a continuous-tone image onto the ink channels that reproduce it.
Its result may be cached, but it is never a second source of truth.
_Avoid_: color conversion, channel split

**Ink channel**:
One independent ink separation reproducing a specific ink. CMYK is a four-channel case; other
processes use other counts and roles.
_Avoid_: Photoshop channel, plate, separation

**White ink mask**:
The DTF ink channel carrying white-ink coverage, kept distinct from the colour channels.
_Avoid_: white channel, spot white

### Measurement

**PPI (pixels per inch)**:
Spatial resolution of a digital image: how many samples it contains per inch.
_Avoid_: dpi, resolution

**DPI (dots per inch)**:
Physical addressing resolution of an output device: how many marks it can place per inch. A
device's declared DPI is not its effective halftone reproduction resolution.
_Avoid_: ppi, resolution, printer resolution

**LPI (lines per inch)**:
Screen ruling: the number of halftone cell lines per inch, measured parallel to the screen angle.
_Avoid_: dpi, frequency, linescreen

### Screening

**Halftone**:
The reprographic technique that simulates continuous tone with dots varying in size or spacing.
_Avoid_: screentone, dither pattern

**Screening method**:
The strategy that turns tonal values into ink marks. Amplitude modulation (AM) varies dot size
on a fixed grid; frequency modulation (FM) varies dot density at a fixed dot size. AM and FM are
first-class; hybrid screening is out of scope until a verifiable definition exists.
_Avoid_: halftone type, dither method

**Screening configuration (screen)**:
The binding of a screening method and its parameters to one ink channel inside a production
profile. Required parameters depend on the method; not every method needs frequency, angle or dot
shape.
_Avoid_: screen entity, halftone settings

**Halftone cell**:
The geometric area carrying one halftone dot and representing one input tonal value. Its nominal
side is 1/LPI inch; its pixel representation is DPI/LPI and need not be an integer.
_Avoid_: dot, pixel block, tile

**Dot**:
The mark a halftone cell produces, with area, shape and position. It is derived at screening time
and has no identity of its own.
_Avoid_: point, element, pixel

**Screen angle**:
The rotation of a halftone screen relative to the angular reference, in degrees.
_Avoid_: rotation, grid angle

**Angular reference**:
The zero-degree direction from which screen angles are measured. RipperFastCustom uses 9
o'clock, a line running to the left.
_Avoid_: origin, base angle

**Rotation direction**:
The direction in which positive screen angles increase. RipperFastCustom measures them
clockwise.
_Avoid_: sign convention

**Channel angle**:
The screen angle assigned to one ink channel by a production profile.
_Avoid_: CMYK angle, separation angle

**Dot shape**:
The geometry of the dot a cell produces, for example round, elliptical or square, which fixes
where neighbouring dots join and how gain behaves.
_Avoid_: spot function, dot type

**Sampling**:
Obtaining or estimating the input image's tonal value for each halftone cell.
_Avoid_: resampling, downsampling

**Thresholding**:
Turning a sampled tonal value into a decision to place a mark or not, according to the screening
method.
_Avoid_: dithering, quantization

**Rosette**:
The periodic pattern produced when the screens of different channels overlap at their assigned
angles. A rosette is intended when it comes from the profile's angle set.
_Avoid_: moiré, interference pattern

**Moiré**:
Unwanted spatial interference between periodic structures: screens, frequencies, orientations or
the reproduction device itself.
_Avoid_: rosette, pattern

### Tone reproduction

**Commanded tonal value (a_form)**:
The ink area fraction requested for a cell by the file or prepress system, 0–100%. "Tonal value"
without a qualifier means this.
_Avoid_: tone, density, gray level

**Corrected tonal value**:
The commanded tonal value after the channel's TRC mapping.
_Avoid_: compensated tone, adjusted value

**Reproducible tonal value**:
The corrected tonal value after the channel's highlight and shadow critical areas are applied.
_Avoid_: clipped tone, printable tone

**Screening result**:
The marks produced by applying the screening method to the reproducible tonal value.
_Avoid_: dot pattern, output bitmap

**Printed tonal value (a_print)**:
The ink area fraction actually reproduced, measured under a stated method and condition.
_Avoid_: achieved tone, actual dot

**Perceived gray**:
The appearance produced by ink, substrate, illumination and observer together.
_Avoid_: apparent tone, visual density

**Dot gain (TVI)**:
The increase in ink area fraction between the commanded and printed tonal values:
TVI = a_print − a_form.
_Avoid_: dot spread, tone increase

**Mechanical dot gain**:
Gain caused by ink physically spreading during transfer and absorption.
_Avoid_: physical gain, press gain

**Optical dot gain (Yule–Nielsen)**:
Darkening caused by light scattering in the substrate around the dots, without the dot changing
size.
_Avoid_: optical gain, area gain

**TRC (tone reproduction curve)**:
A per-channel curve mapping commanded tonal values to compensated values, derived from
measurement and calibration of a real process.
_Avoid_: calibration curve, gamma curve, dot gain model

**Highlight critical area (a_wf)**:
The smallest tonal value a channel reproduces reliably under its production profile.
_Avoid_: minimum dot, smallest dot

**Shadow critical area (a_vf)**:
The tonal value at which the halftone pattern closes into a solid under its production profile.
_Avoid_: maximum dot, dot closing point

### Production

**Production profile**:
The named set of process conditions (printing process, screening method, channel count, mesh,
ink, substrate) that owns concrete parameter values such as angles, curves and limits. Its
process kind is an extensible discriminant, and process-specific attributes stay inside the
profile.
_Avoid_: preset, settings, configuration

**Output result**:
The screened raster produced per ink channel, together with an immutable snapshot of the profile,
TRC, limits, method parameters, output resolution and engine version that produced it.
_Avoid_: render, export, job

**Mesh count**:
The number of threads per unit length in a screen-printing mesh. It constrains which screen
rulings a profile can support.
_Avoid_: mesh resolution, screen density

**DTF (direct-to-film)**:
A production process that inkjets a mirrored image onto film for transfer. It has its own
resolution, channel set and white-ink handling, and does not inherit offset screen parameters.
_Avoid_: DTG, CMYK transfer

**Choke**:
A reduction of an area so a neighbouring ink overlaps it and no substrate halo shows.
_Avoid_: shrink, trap

**Expansion (spread)**:
An enlargement of an area so it overlaps a neighbouring one and misregistration cannot open a
gap.
_Avoid_: bleed, grow

## Verification status

Verified against a primary source this session:

- PPI as image resolution, and its separation from printer resolution (Adobe Photoshop Help).

Verified only against secondary sources (Wikipedia, itself citing Johansson/Lundberg/Ryberg
2007, Yule–Nielsen 1951, Haller 1979 and Viggiano 1983):

- AM and FM definitions, dot shapes and their joining tonal values, the dot gain formula and its
  reference measurements, and the halftone cell model.

Still unverified — do not treat as settled:

- Any LPI range for screen printing, DTF or CMYK. The 45–65 lpi screen-printing row in the source
  table is flagged as uncited.
- Any concrete CMYK screen angle set. Adobe documents 108/162/90/45 for its Color Halftone
  filter; the classic set cited in the literature is not verified here, and the two are not
  interchangeable.
- Hybrid screening. No accessible source was found.
- Any mesh-count-to-LPI rule for screen printing.
- Spot-colour screening mechanics; the sources describe the process, not its screening rules.
- Any DTF-specific resolution, white coverage, choke/expansion value or dot gain behaviour.
- The rosette and moiré definitions come from secondary sources.
- Choke and expansion are general prepress concepts that were not source-verified this session.
