/**
 * Deterministic fixtures for the halftone performance benchmark.
 *
 * The declared matrix follows the performance specification: 1, 4 and 16
 * megapixels, 1, 4 and 8 tone channels, and 8- and 16-bit input. Every fixture
 * is synthetic and fully declared here; no physical preset and no randomness
 * are involved.
 *
 * A one-channel fixture is grayscale and uses the declared channel-preserving
 * grey-to-black mapping. Multi-channel fixtures use an RGB input and a declared
 * linear-mixing matrix, because channel-preserving mapping admits only one input
 * channel per tone channel.
 */

import type {
  BitDepth,
  ContinuousToneInput,
  InputLayout,
  InkChannel,
  ProductionProfile,
  SeparationDeclaration,
  TransformIdentity,
} from '../../src/engines/halftone/contracts';

export type FixtureChannelCount = 1 | 4 | 8;
export type FixtureBitDepth = BitDepth;
export type FixtureLayout = InputLayout;

export interface FixtureSpec {
  readonly id: string;
  readonly megapixels: number;
  readonly width: number;
  readonly height: number;
  readonly channels: FixtureChannelCount;
  readonly bitDepth: FixtureBitDepth;
  readonly layout: FixtureLayout;
  /** True for the reduced-size smoke fixtures that keep `npm test` bounded. */
  readonly smoke: boolean;
}

const SIDE_BY_MEGAPIXELS: Record<1 | 4 | 16, number> = {
  1: 1_000,
  4: 2_000,
  16: 4_000,
};

export const DECLARED_MEGAPIXELS = [1, 4, 16] as const;
export const DECLARED_CHANNEL_COUNTS: readonly FixtureChannelCount[] = [1, 4, 8];
export const DECLARED_BIT_DEPTHS: readonly FixtureBitDepth[] = [8, 16];

export const REFERENCE_DPI = 300;
export const REFERENCE_PPI = 300;
export const REFERENCE_LPI = 25;
export const REFERENCE_DOT_SHAPE = 'round' as const;

const ANGLES_BY_CHANNELS: Record<FixtureChannelCount, readonly number[]> = {
  1: [0],
  4: [0, 15, 45, 75],
  8: [0, 15, 30, 45, 60, 75, 90, 105],
};

/** Non-negative, row-stochastic mixing rows that keep every channel in [0, 1]. */
const MIXING_ROWS: readonly (readonly number[])[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
  [0.5, 0.5, 0],
  [0, 0.5, 0.5],
  [0.5, 0, 0.5],
  [1 / 3, 1 / 3, 1 / 3],
  [0.25, 0.5, 0.25],
];

function fixtureId(
  side: number,
  channels: FixtureChannelCount,
  bitDepth: FixtureBitDepth,
  smoke: boolean,
): string {
  const size = smoke
    ? `smoke-${String(side)}px`
    : `${String(Math.round((side * side) / 1_000_000))}mp`;
  return `${size}-${String(channels)}ch-${String(bitDepth)}bit`;
}

function spec(
  megapixels: 1 | 4 | 16,
  channels: FixtureChannelCount,
  bitDepth: FixtureBitDepth,
  side: number,
  smoke: boolean,
): FixtureSpec {
  return {
    id: fixtureId(side, channels, bitDepth, smoke),
    megapixels: smoke ? (side * side) / 1_000_000 : megapixels,
    width: side,
    height: side,
    channels,
    bitDepth,
    layout: channels === 1 ? 'grayscale' : 'rgb',
    smoke,
  };
}

/**
 * Builds an ad-hoc smoke fixture of a given side. Reserved for the reduced-size
 * tests that must fit inside the default-suite budget; the identifiers stay in
 * the smoke namespace so they never collide with the declared matrix.
 */
export function makeSmokeFixture(
  side: number,
  channels: FixtureChannelCount,
  bitDepth: FixtureBitDepth = 8,
): FixtureSpec {
  return spec(1, channels, bitDepth, side, true);
}

/** The full declared matrix: every combination the specification names. */
export const DECLARED_FIXTURES: readonly FixtureSpec[] = DECLARED_MEGAPIXELS.flatMap((megapixels) =>
  DECLARED_CHANNEL_COUNTS.flatMap((channels) =>
    DECLARED_BIT_DEPTHS.map((bitDepth) =>
      spec(megapixels, channels, bitDepth, SIDE_BY_MEGAPIXELS[megapixels], false),
    ),
  ),
);

/**
 * Reduced fixtures used by the default `npm test` run. They keep the same
 * engine paths and assertions while staying inside the declared environment
 * budget; the full matrix is recorded by the baseline capture.
 */
export const SMOKE_FIXTURES: readonly FixtureSpec[] = [
  spec(1, 1, 8, 250, true),
  spec(1, 1, 8, 500, true),
  spec(1, 4, 8, 500, true),
  spec(1, 8, 8, 500, true),
];

export function fixtureById(id: string): FixtureSpec {
  const found = [...DECLARED_FIXTURES, ...SMOKE_FIXTURES].find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`unknown halftone fixture: ${id}`);
  return found;
}

function identity(type: 'channel-preserving' | 'linear-mixing'): TransformIdentity {
  return {
    id: `${type}-transform`,
    version: '1',
    type,
    parameterHash: 'a'.repeat(64),
    hashAlgorithm: 'sha256',
    canonicalisationVersion: '1',
  };
}

function channel(id: string, role: string, angle: number): InkChannel {
  return {
    id,
    role,
    dataKind: 'tone',
    screening: {
      method: 'am',
      frequency: REFERENCE_LPI,
      angle,
      dotShape: REFERENCE_DOT_SHAPE,
    },
  };
}

function separationFor(specification: FixtureSpec): SeparationDeclaration {
  if (specification.channels === 1) {
    return {
      mode: 'channel-preserving',
      identity: identity('channel-preserving'),
      channelMap: { gray: 'k' },
    };
  }
  return {
    mode: 'linear-mixing',
    identity: identity('linear-mixing'),
    matrix: MIXING_ROWS.slice(0, specification.channels).map((row) => [...row]),
  };
}

/** A declared profile for the fixture: no physical preset is involved. */
export function createProfile(specification: FixtureSpec): ProductionProfile {
  const angles = ANGLES_BY_CHANNELS[specification.channels];
  const channels =
    specification.channels === 1
      ? [channel('k', 'black', angles[0] ?? 0)]
      : Array.from({ length: specification.channels }, (_, index) =>
          channel(`c${String(index)}`, `ink-${String(index)}`, angles[index] ?? index * 15),
        );
  return {
    id: `bench-${specification.id}`,
    version: '1',
    processKind: 'screen-printing',
    channels,
    separation: separationFor(specification),
  };
}

/**
 * Synthetic continuous-tone samples: a deterministic diagonal ramp that uses
 * intermediate values at both bit depths, so the prepared-artwork distribution
 * check never mistakes it for binary material.
 */
export function createInput(specification: FixtureSpec): ContinuousToneInput {
  const { width, height, bitDepth, layout } = specification;
  const inputChannels = layout === 'rgb' ? 3 : 1;
  const samples = width * height;
  const data =
    bitDepth === 8
      ? new Uint8Array(samples * inputChannels)
      : new Uint16Array(samples * inputChannels);
  const scale = bitDepth === 8 ? 1 : 257;

  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      const pixel = row + x;
      for (let component = 0; component < inputChannels; component += 1) {
        const level = (x * 7 + y * 13 + component * 29) % 256;
        data[pixel * inputChannels + component] = level * scale;
      }
    }
  }

  return {
    width,
    height,
    ppi: REFERENCE_PPI,
    bitDepth,
    layout,
    data,
  };
}

export interface BuiltFixture {
  readonly spec: FixtureSpec;
  readonly input: ContinuousToneInput;
  readonly profile: ProductionProfile;
}

export function buildFixture(specification: FixtureSpec): BuiltFixture {
  return {
    spec: specification,
    input: createInput(specification),
    profile: createProfile(specification),
  };
}
