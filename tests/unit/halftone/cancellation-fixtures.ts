import type {
  CancellationToken,
  ChannelDataKind,
  ContinuousToneInput,
  InkChannel,
  PreviewSettings,
  ProductionProfile,
  SeparationDeclaration,
  TransformIdentity,
} from '../../../src/engines/halftone/contracts';
import { assembleScreeningResult } from '../../../src/engines/halftone/result';

export function makeIdentity(type: 'channel-preserving'): TransformIdentity {
  return {
    id: `${type}-transform`,
    version: '1',
    type,
    parameterHash: 'a'.repeat(64),
    hashAlgorithm: 'sha256',
    canonicalisationVersion: '1',
  };
}

export function makeChannel(overrides: Partial<InkChannel> = {}): InkChannel {
  return {
    id: 'k',
    role: 'black',
    dataKind: 'tone' as ChannelDataKind,
    screening: { method: 'am', frequency: 25, angle: 0, dotShape: 'round' },
    ...overrides,
  };
}

export function grayToBlack(): SeparationDeclaration {
  return {
    mode: 'channel-preserving',
    identity: makeIdentity('channel-preserving'),
    channelMap: { gray: 'k' },
  };
}

export function rgbToCmy(): SeparationDeclaration {
  return {
    mode: 'channel-preserving',
    identity: makeIdentity('channel-preserving'),
    channelMap: { r: 'c', g: 'm', b: 'y' },
  };
}

export function makeInput(width: number, height: number): ContinuousToneInput {
  const data = new Uint8Array(width * height);
  for (let index = 0; index < data.length; index += 1) data[index] = (index * 37) % 256;
  return { width, height, ppi: 100, bitDepth: 8, layout: 'grayscale', data };
}

export function makeRgbInput(width: number, height: number): ContinuousToneInput {
  const data = new Uint8Array(width * height * 3);
  for (let index = 0; index < data.length; index += 1) data[index] = (index * 29) % 256;
  return { width, height, ppi: 100, bitDepth: 8, layout: 'rgb', data };
}

export function grayProfile(): ProductionProfile {
  return {
    id: 'gray',
    version: '1',
    processKind: 'screen-printing',
    channels: [makeChannel()],
    separation: grayToBlack(),
  };
}

export function threeChannelProfile(): ProductionProfile {
  return {
    id: 'cmy',
    version: '1',
    processKind: 'screen-printing',
    channels: [
      makeChannel({
        id: 'c',
        role: 'cyan',
        screening: { method: 'am', frequency: 25, angle: 15, dotShape: 'round' },
      }),
      makeChannel({
        id: 'm',
        role: 'magenta',
        screening: { method: 'am', frequency: 25, angle: 45, dotShape: 'round' },
      }),
      makeChannel({
        id: 'y',
        role: 'yellow',
        screening: { method: 'am', frequency: 25, angle: 75, dotShape: 'round' },
      }),
    ],
    separation: rgbToCmy(),
  };
}

export interface RunOptions {
  readonly input?: ContinuousToneInput;
  readonly profile?: ProductionProfile;
  readonly dpi?: number;
  readonly preview?: PreviewSettings;
  readonly tiles?: readonly { x: number; y: number; width: number; height: number }[];
  readonly isCancelled?: CancellationToken;
}

export function run(options: RunOptions = {}) {
  return assembleScreeningResult({
    request: {
      input: options.input ?? makeInput(4, 4),
      profile: options.profile ?? grayProfile(),
      output: { dpi: options.dpi ?? 100 },
      preview: options.preview,
    },
    tiles: options.tiles,
    isCancelled: options.isCancelled,
  });
}

/**
 * A token that counts its consultations and flips after `cancelAt`. `null`
 * means it never fires, which is how the check count of a completed run is
 * measured without changing the outcome.
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
