/**
 * Fixtures for the end-to-end acceptance suite.
 *
 * Every value is declared here or by the caller: there is no physical preset,
 * no universal angle set and no LPI range. The geometry is deliberately tiny
 * (8 x 8 output pixels at 100 DPI, 25 LPI, a 4-pixel cell) so the whole
 * acceptance matrix runs in a bounded time while still exercising fractional
 * placement, edge clamping and tiled processing.
 *
 * The suite drives the single public screening seam (`assembleScreeningResult`);
 * no fixture reaches into an internal stage.
 */

import { createHash } from 'node:crypto';

import type {
  CancellationToken,
  ChannelDataKind,
  ContinuousToneInput,
  IccConverter,
  InkChannel,
  MaskSource,
  OutputTile,
  PreviewSettings,
  ProductionProfile,
  ScreeningRequest,
  SeparationDeclaration,
  TransformIdentity,
} from '../../src/engines/halftone/contracts';
import type { AssembleInput } from '../../src/engines/halftone/result';
import { assembleScreeningResult } from '../../src/engines/halftone/result';

/** Declared output resolution of the shared fixture geometry. */
export const BASE_DPI = 100;
/** Declared screen frequency of the shared fixture geometry. */
export const BASE_LPI = 25;
/** Input side in pixels; at 100 PPI and 100 DPI it is also the canvas side. */
export const BASE_SIZE = 8;
/** Declared identity reproduction limits. */
export const IDENTITY_LIMITS = Object.freeze({ a_wf: 0, a_vf: 1 });

export type FixtureProfile = ProductionProfile<Record<string, unknown>>;

export function identityCurve(): {
  readonly points: readonly { readonly input: number; readonly output: number }[];
  readonly interpolation: 'linear';
} {
  return Object.freeze({
    points: Object.freeze([
      Object.freeze({ input: 0, output: 0 }),
      Object.freeze({ input: 1, output: 1 }),
    ]),
    interpolation: 'linear' as const,
  });
}

/** A stable, well-formed transform identity. */
export function transformIdentity(overrides: Partial<TransformIdentity> = {}): TransformIdentity {
  return {
    id: 'channel-preserving-transform',
    version: '1',
    type: 'channel-preserving',
    parameterHash: 'a'.repeat(64),
    hashAlgorithm: 'sha256',
    canonicalisationVersion: '1',
    ...overrides,
  };
}

/** One fully declared AM tone channel; every physical value is a parameter. */
export function toneChannel(overrides: Partial<InkChannel> = {}): InkChannel {
  return {
    id: 'k',
    role: 'black',
    dataKind: 'tone' as ChannelDataKind,
    screening: { method: 'am', frequency: BASE_LPI, angle: 0, dotShape: 'round' },
    trc: identityCurve(),
    limits: IDENTITY_LIMITS,
    ...overrides,
  };
}

function channelWithAngle(id: string, role: string, angle: number): InkChannel {
  return toneChannel({
    id,
    role,
    screening: { method: 'am', frequency: BASE_LPI, angle, dotShape: 'round' },
  });
}

/** Channel-preserving grayscale declaration: grey samples map to one ink channel. */
export function graySeparation(): SeparationDeclaration {
  return {
    mode: 'channel-preserving',
    identity: transformIdentity(),
    channelMap: { gray: 'k' },
  };
}

/** Channel-preserving RGB declaration: each primary owns one ink channel. */
export function rgbSeparation(): SeparationDeclaration {
  return {
    mode: 'channel-preserving',
    identity: transformIdentity(),
    channelMap: { r: 'c', g: 'm', b: 'y' },
  };
}

/** A one-channel grayscale profile with the declared grey-to-black mapping. */
export function grayProfile(overrides: Partial<FixtureProfile> = {}): FixtureProfile {
  return {
    id: 'acceptance-gray',
    version: '1',
    processKind: 'screen-printing',
    channels: [toneChannel()],
    separation: graySeparation(),
    ...overrides,
  };
}

/** A three-channel profile driven by the declared RGB channel-preserving map. */
export function rgbProfile(overrides: Partial<FixtureProfile> = {}): FixtureProfile {
  return {
    id: 'acceptance-rgb',
    version: '1',
    processKind: 'screen-printing',
    channels: [
      channelWithAngle('c', 'cyan', 15),
      channelWithAngle('m', 'magenta', 45),
      channelWithAngle('y', 'yellow', 75),
    ],
    separation: rgbSeparation(),
    ...overrides,
  };
}

/** A four-ink profile driven by an explicit, declared mixing matrix. */
export function fourChannelProfile(overrides: Partial<FixtureProfile> = {}): FixtureProfile {
  return {
    id: 'acceptance-four-ink',
    version: '1',
    processKind: 'screen-printing',
    channels: [
      channelWithAngle('c', 'cyan', 0),
      channelWithAngle('m', 'magenta', 15),
      channelWithAngle('y', 'yellow', 45),
      channelWithAngle('k', 'black', 75),
    ],
    separation: {
      mode: 'linear-mixing',
      identity: transformIdentity({ id: 'four-ink-matrix', type: 'linear-mixing' }),
      matrix: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
        [0.25, 0.25, 0.5],
      ],
    },
    ...overrides,
  };
}

/** An eight-ink profile: the engine assumes no four-channel limit. */
export function eightChannelProfile(overrides: Partial<FixtureProfile> = {}): FixtureProfile {
  const roster: readonly (readonly [string, string, number])[] = [
    ['c', 'cyan', 0],
    ['m', 'magenta', 15],
    ['y', 'yellow', 30],
    ['k', 'black', 45],
    ['r', 'red', 60],
    ['g', 'green', 75],
    ['b', 'blue', 90],
    ['o', 'orange', 105],
  ];
  const matrix = roster.map((_entry, index) => [
    index === 0 ? 1 : 0,
    index === 1 ? 1 : 0,
    index === 2 ? 1 : 0,
  ]);

  return {
    id: 'acceptance-eight-ink',
    version: '1',
    processKind: 'screen-printing',
    channels: roster.map(([id, role, angle]) => channelWithAngle(id, role, angle)),
    separation: {
      mode: 'linear-mixing',
      identity: transformIdentity({ id: 'eight-ink-matrix', type: 'linear-mixing' }),
      matrix,
    },
    ...overrides,
  };
}

/** A flat grayscale input at the declared sample value. */
export function flatInput(
  sample: number,
  size: number = BASE_SIZE,
  overrides: Partial<ContinuousToneInput> = {},
): ContinuousToneInput {
  return {
    width: size,
    height: size,
    ppi: 100,
    bitDepth: 8,
    layout: 'grayscale',
    data: new Uint8Array(size * size).fill(sample),
    ...overrides,
  };
}

/**
 * A deterministic ramp that always contains intermediate samples, so the
 * prepared-artwork tonal-distribution check never rejects it.
 */
export function rampInput(
  size: number = BASE_SIZE,
  overrides: Partial<ContinuousToneInput> = {},
): ContinuousToneInput {
  const data = new Uint8Array(size * size);
  for (let index = 0; index < data.length; index += 1) data[index] = (index * 37) % 256;
  return {
    width: size,
    height: size,
    ppi: 100,
    bitDepth: 8,
    layout: 'grayscale',
    data,
    ...overrides,
  };
}

/** A deterministic RGB ramp with intermediate samples on every primary. */
export function rgbInput(
  size: number = BASE_SIZE,
  overrides: Partial<ContinuousToneInput> = {},
): ContinuousToneInput {
  const data = new Uint8Array(size * size * 3);
  for (let index = 0; index < data.length; index += 1) data[index] = (index * 29) % 256;
  return { width: size, height: size, ppi: 100, bitDepth: 8, layout: 'rgb', data, ...overrides };
}

/** A second declared frequency used by the fractional-pitch cases. */
export const FRACTIONAL_LPI = 175;

export interface RunOptions {
  readonly input?: ContinuousToneInput;
  readonly profile?: FixtureProfile;
  readonly dpi?: number;
  readonly preview?: PreviewSettings;
  readonly tiles?: readonly OutputTile[];
  readonly isCancelled?: CancellationToken;
  readonly iccConverter?: IccConverter;
  readonly maskSources?: readonly MaskSource[];
}

/** Drives the single public seam. Nothing here reaches into an internal stage. */
export function run(options: RunOptions = {}) {
  const request: ScreeningRequest<Record<string, unknown>> = {
    input: options.input ?? flatInput(128),
    profile: options.profile ?? grayProfile(),
    output: { dpi: options.dpi ?? BASE_DPI },
    preview: options.preview,
  };

  const assembled: AssembleInput<Record<string, unknown>> = {
    request,
    tiles: options.tiles,
    isCancelled: options.isCancelled,
    iccConverter: options.iccConverter,
    maskSources: options.maskSources,
  };

  return assembleScreeningResult(assembled);
}

/** Issue codes in the order the envelope carries them. */
export function codes(result: { readonly issues: readonly { readonly code: string }[] }): string[] {
  return result.issues.map((issue) => issue.code);
}

/** Hash over every raster's identity, dimensions and bytes, in channel order. */
export function rasterDigest(result: {
  readonly status: string;
  readonly rasters?: readonly {
    readonly channelId: string;
    readonly width: number;
    readonly height: number;
    readonly data: Uint8Array;
  }[];
}): string {
  if (result.status !== 'completed' || result.rasters === undefined) {
    throw new Error(`expected a completed result, received ${result.status}`);
  }
  const hash = createHash('sha256');
  for (const raster of result.rasters) {
    hash.update(raster.channelId);
    hash.update(`${String(raster.width)}x${String(raster.height)}`);
    hash.update(raster.data);
  }
  return hash.digest('hex');
}

/**
 * A token that counts its consultations and flips after `cancelAt`. `null`
 * never fires, which measures the check count of a completed run without
 * changing its outcome.
 */
export function countingToken(cancelAt: number | null): {
  readonly token: CancellationToken;
  readonly calls: () => number;
} {
  let calls = 0;
  return {
    token: () => {
      calls += 1;
      return cancelAt !== null && calls >= cancelAt;
    },
    calls: () => calls,
  };
}
