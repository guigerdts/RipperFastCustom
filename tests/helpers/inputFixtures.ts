import type { ContinuousToneInput } from '../../src/engines/halftone/contracts';

/** A small deterministic raster, enough for adapter and contract tests. */
export function sampleInput(
  layout: 'grayscale' | 'rgb' = 'rgb',
  width = 8,
  height = 8,
): ContinuousToneInput {
  const components = layout === 'rgb' ? 3 : 1;
  const data = new Uint8Array(width * height * components);
  for (let index = 0; index < data.length; index += 1) data[index] = (index * 29) % 256;
  return { width, height, ppi: 300, bitDepth: 8, layout, data };
}
