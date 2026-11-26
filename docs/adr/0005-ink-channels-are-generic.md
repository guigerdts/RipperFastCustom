# Ink channels are generic, CMYK is one case

A job is modelled as N ink channels, each an independent separation for a specific ink; CMYK is
the four-channel case with named roles. The domain never assumes four channels, never assumes
CMYK, and never equates a Photoshop channel with an ink channel — that mapping belongs to an
adapter.

**Considered options**: a CMYK-first model with spot inks as exceptions (rejected — screen
printing and DTF routinely run other channel sets, including white).
