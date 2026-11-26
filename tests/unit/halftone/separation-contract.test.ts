import { describe, expect, it } from 'vitest';
import {
  isRegisteredIssueCode,
  type ChannelDataKind,
  type ContinuousToneInput,
  type IccConverter,
  type InkChannel,
  type ProductionProfile,
  type SeparationDeclaration,
  type SeparationMode,
  type SeparationResult,
  type TransformIdentity,
} from '../../../src/engines/halftone/contracts';
import { separate } from '../../../src/engines/halftone/separation';

const HASH = 'a'.repeat(64);

function makeIdentity(
  type: SeparationMode,
  overrides: Record<string, unknown> = {},
): TransformIdentity {
  return {
    id: `${type}-transform`,
    version: '1',
    type,
    parameterHash: HASH,
    hashAlgorithm: 'sha256',
    canonicalisationVersion: '1',
    ...overrides,
  } as TransformIdentity;
}

function makeChannel(id: string, role: string, dataKind: ChannelDataKind = 'tone'): InkChannel {
  return {
    id,
    role,
    dataKind,
    screening: { method: 'am', frequency: 45, angle: 45, dotShape: 'round' },
  };
}

function makeProfile(overrides: Record<string, unknown> = {}): ProductionProfile {
  return {
    id: 'profile',
    version: '1',
    processKind: 'screen-printing',
    channels: [makeChannel('k', 'black')],
    ...overrides,
  } as unknown as ProductionProfile;
}

function makeGrayInput(samples: readonly number[], bitDepth: 8 | 16 = 8): ContinuousToneInput {
  const data = bitDepth === 8 ? Uint8Array.from(samples) : Uint16Array.from(samples);
  return {
    width: 2,
    height: 2,
    ppi: 300,
    bitDepth,
    layout: 'grayscale',
    data,
  };
}

function makeRgbInput(samples: readonly number[], bitDepth: 8 | 16 = 8): ContinuousToneInput {
  const data = bitDepth === 8 ? Uint8Array.from(samples) : Uint16Array.from(samples);
  return {
    width: 2,
    height: 2,
    ppi: 300,
    bitDepth,
    layout: 'rgb',
    data,
  };
}

function codes(result: SeparationResult): string[] {
  return result.issues.map((issue) => issue.code);
}

function channelData(result: SeparationResult, id: string): number[] {
  if (result.status !== 'accepted') throw new Error('expected an accepted separation');
  const channel = result.channels.find((entry) => entry.id === id);
  if (channel === undefined) throw new Error(`missing channel ${id}`);
  return Array.from(channel.data);
}

function grayToBlack(): SeparationDeclaration {
  return {
    mode: 'channel-preserving',
    identity: makeIdentity('channel-preserving'),
    channelMap: { gray: 'k' },
  };
}

function rgbPreserving(): SeparationDeclaration {
  return {
    mode: 'channel-preserving',
    identity: makeIdentity('channel-preserving', { id: 'rgb-preserving' }),
    channelMap: { r: 'r', g: 'g', b: 'b' },
  };
}

function cmykMixing(): SeparationDeclaration {
  return {
    mode: 'linear-mixing',
    identity: makeIdentity('linear-mixing', { id: 'cmyk-mixing' }),
    matrix: [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [0.5, 0.5, 0],
    ],
  };
}

function cmykChannels(): InkChannel[] {
  return [
    makeChannel('c', 'cyan'),
    makeChannel('m', 'magenta'),
    makeChannel('y', 'yellow'),
    makeChannel('k', 'black'),
  ];
}

const RGB_SAMPLES = [
  255,
  0,
  0, // red
  0,
  255,
  0, // green
  0,
  0,
  255, // blue
  255,
  255,
  255, // white
];

describe('declared channel sets', () => {
  it('produces exactly one tone channel for a grayscale job', () => {
    const result = separate({
      input: makeGrayInput([0, 85, 170, 255]),
      profile: makeProfile({ separation: grayToBlack() }),
    });

    expect(result.status).toBe('accepted');
    if (result.status === 'accepted') {
      expect(result.channels.map((channel) => channel.id)).toEqual(['k']);
      expect(result.channels).toHaveLength(1);
    }
  });

  it('produces exactly three channels for an RGB channel-preserving job', () => {
    const result = separate({
      input: makeRgbInput(RGB_SAMPLES),
      profile: makeProfile({
        channels: [makeChannel('r', 'red'), makeChannel('g', 'green'), makeChannel('b', 'blue')],
        separation: rgbPreserving(),
      }),
    });

    expect(result.status).toBe('accepted');
    if (result.status === 'accepted') {
      expect(result.channels.map((channel) => channel.id)).toEqual(['r', 'g', 'b']);
    }
  });

  it('produces exactly four channels for a declared CMYK mixing job', () => {
    const result = separate({
      input: makeRgbInput(RGB_SAMPLES),
      profile: makeProfile({ channels: cmykChannels(), separation: cmykMixing() }),
    });

    expect(result.status).toBe('accepted');
    if (result.status === 'accepted') {
      expect(result.channels.map((channel) => channel.id)).toEqual(['c', 'm', 'y', 'k']);
      for (const channel of result.channels) {
        expect(channel.data).toHaveLength(4);
      }
    }
  });

  it('produces exactly eight channels for an eight-ink declared mixing job', () => {
    const channels = [
      makeChannel('c', 'cyan'),
      makeChannel('m', 'magenta'),
      makeChannel('y', 'yellow'),
      makeChannel('k', 'black'),
      makeChannel('o', 'orange'),
      makeChannel('g', 'green'),
      makeChannel('v', 'violet'),
      makeChannel('x', 'custom-spot'),
    ];
    const matrix = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [0, 0, 0],
      [0.5, 0, 0],
      [0, 0.5, 0],
      [0, 0, 0.5],
      [1, 1, 1],
    ];

    const result = separate({
      input: makeRgbInput(RGB_SAMPLES),
      profile: makeProfile({
        channels,
        separation: {
          mode: 'linear-mixing',
          identity: makeIdentity('linear-mixing', { id: 'eight-ink' }),
          matrix,
        },
      }),
    });

    expect(result.status).toBe('accepted');
    if (result.status === 'accepted') {
      expect(result.channels.map((channel) => channel.id)).toEqual([
        'c',
        'm',
        'y',
        'k',
        'o',
        'g',
        'v',
        'x',
      ]);
      expect(result.channels).toHaveLength(8);
    }
  });

  it('rejects a tone-channel profile without any declared separation', () => {
    const result = separate({
      input: makeRgbInput(RGB_SAMPLES),
      profile: makeProfile({ channels: cmykChannels() }),
    });

    expect(result.status).toBe('rejected');
    expect(codes(result)).toContain('separation.undeclared_mapping');
    expect('channels' in result).toBe(false);
  });
});

describe('channel-preserving declared mapping', () => {
  it('expands 8-bit samples deterministically and keeps one channel per input', () => {
    const result = separate({
      input: makeGrayInput([0, 85, 170, 255]),
      profile: makeProfile({ separation: grayToBlack() }),
    });

    expect(channelData(result, 'k')).toEqual([0, 85 * 257, 170 * 257, 65535]);
  });

  it('uses 16-bit samples directly', () => {
    const result = separate({
      input: makeGrayInput([0, 1, 32768, 65535], 16),
      profile: makeProfile({ separation: grayToBlack() }),
    });

    expect(channelData(result, 'k')).toEqual([0, 1, 32768, 65535]);
  });

  it('maps every input channel to its declared ink channel', () => {
    const result = separate({
      input: makeRgbInput([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]),
      profile: makeProfile({
        channels: [makeChannel('r', 'red'), makeChannel('g', 'green'), makeChannel('b', 'blue')],
        separation: rgbPreserving(),
      }),
    });

    expect(channelData(result, 'r')).toEqual([10, 40, 70, 100].map((value) => value * 257));
    expect(channelData(result, 'g')).toEqual([20, 50, 80, 110].map((value) => value * 257));
    expect(channelData(result, 'b')).toEqual([30, 60, 90, 120].map((value) => value * 257));
  });

  it('applies an optional per-channel transfer function', () => {
    const result = separate({
      input: makeGrayInput([0, 85, 170, 255]),
      profile: makeProfile({
        separation: {
          mode: 'channel-preserving',
          identity: makeIdentity('channel-preserving', { id: 'inverted' }),
          channelMap: { gray: 'k' },
          transferFunctions: {
            k: {
              points: [
                { input: 0, output: 1 },
                { input: 1, output: 0 },
              ],
              interpolation: 'linear',
            },
          },
        },
      }),
    });

    expect(channelData(result, 'k')).toEqual([65535, 65535 - 85 * 257, 65535 - 170 * 257, 0]);
  });

  it('rejects a transfer function with non-increasing control-point inputs', () => {
    const result = separate({
      input: makeGrayInput([0, 85, 170, 255]),
      profile: makeProfile({
        separation: {
          mode: 'channel-preserving',
          identity: makeIdentity('channel-preserving'),
          channelMap: { gray: 'k' },
          transferFunctions: {
            k: {
              points: [
                { input: 0.5, output: 0.5 },
                { input: 0.5, output: 1 },
              ],
              interpolation: 'linear',
            },
          },
        },
      }),
    });

    expect(result.status).toBe('rejected');
    expect(codes(result)).toContain('separation.invalid_transfer_function');
  });
});

describe('declared linear mixing', () => {
  it('applies the declared matrix exactly and quantises half up', () => {
    const result = separate({
      input: makeRgbInput(RGB_SAMPLES),
      profile: makeProfile({ channels: cmykChannels(), separation: cmykMixing() }),
    });

    expect(channelData(result, 'c')).toEqual([65535, 0, 0, 65535]);
    expect(channelData(result, 'm')).toEqual([0, 65535, 0, 65535]);
    expect(channelData(result, 'y')).toEqual([0, 0, 65535, 65535]);
    expect(channelData(result, 'k')).toEqual([32768, 32768, 0, 65535]);
  });

  it('clamps a declared mix that leaves the normalized range', () => {
    const result = separate({
      input: makeRgbInput([255, 255, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      profile: makeProfile({
        channels: [makeChannel('k', 'black')],
        separation: {
          mode: 'linear-mixing',
          identity: makeIdentity('linear-mixing'),
          matrix: [[1, 1, 1]],
        },
      }),
    });

    expect(channelData(result, 'k')).toEqual([65535, 0, 0, 0]);
  });

  it('rejects a matrix with the wrong number of rows', () => {
    const result = separate({
      input: makeRgbInput(RGB_SAMPLES),
      profile: makeProfile({
        channels: cmykChannels(),
        separation: {
          mode: 'linear-mixing',
          identity: makeIdentity('linear-mixing'),
          matrix: [
            [1, 0, 0],
            [0, 1, 0],
          ],
        },
      }),
    });

    expect(result.status).toBe('rejected');
    expect(codes(result)).toContain('separation.invalid_matrix');
  });

  it('rejects a matrix row with the wrong number of columns', () => {
    const result = separate({
      input: makeRgbInput(RGB_SAMPLES),
      profile: makeProfile({
        separation: {
          mode: 'linear-mixing',
          identity: makeIdentity('linear-mixing'),
          matrix: [[1, 0]],
        },
      }),
    });

    expect(result.status).toBe('rejected');
    expect(codes(result)).toContain('separation.invalid_matrix');
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects the non-finite coefficient %s',
    (coefficient) => {
      const result = separate({
        input: makeGrayInput([0, 85, 170, 255]),
        profile: makeProfile({
          separation: {
            mode: 'linear-mixing',
            identity: makeIdentity('linear-mixing'),
            matrix: [[coefficient]],
          },
        }),
      });

      expect(result.status).toBe('rejected');
      expect(codes(result)).toContain('separation.invalid_matrix');
    },
  );

  it('rejects an undeclared matrix (mixing without a declaration)', () => {
    const result = separate({
      input: makeRgbInput(RGB_SAMPLES),
      profile: makeProfile({ channels: cmykChannels() }),
    });

    expect(result.status).toBe('rejected');
    expect(codes(result)).toContain('separation.undeclared_mapping');
  });
});

describe('injected ICC transform', () => {
  function iccProfile(overrides: Record<string, unknown> = {}): ProductionProfile {
    return makeProfile({
      separation: {
        mode: 'icc',
        identity: makeIdentity('icc', { id: 'icc-transform' }),
        provenance: {
          sourceProfileId: 'source-profile',
          sourceProfileHash: HASH,
          destinationProfileId: 'destination-profile',
          destinationProfileHash: HASH,
          renderingIntent: 'relative-colorimetric',
          blackPointCompensation: true,
        },
        ...overrides,
      },
    });
  }

  const converter: IccConverter = (input) => [input.channels[0]?.map((value) => 1 - value) ?? []];

  it('accepts a complete descriptor and records the transform identity', () => {
    const result = separate({
      input: makeGrayInput([0, 85, 170, 255]),
      profile: iccProfile(),
      iccConverter: converter,
    });

    expect(result.status).toBe('accepted');
    expect(channelData(result, 'k')).toEqual([65535, 65535 - 85 * 257, 65535 - 170 * 257, 0]);
    if (result.status === 'accepted') {
      expect(result.channels[0]?.transformIdentity).toBe('icc-transform');
      expect(result.transforms).toHaveLength(1);
    }
  });

  it('rejects a missing transform identity', () => {
    const result = separate({
      input: makeGrayInput([0, 85, 170, 255]),
      profile: iccProfile({ identity: undefined }),
      iccConverter: converter,
    });

    expect(result.status).toBe('rejected');
    expect(codes(result)).toContain('separation.unidentifiable_transform');
  });

  it('rejects a missing transform version', () => {
    const result = separate({
      input: makeGrayInput([0, 85, 170, 255]),
      profile: iccProfile({ identity: makeIdentity('icc', { version: '' }) }),
      iccConverter: converter,
    });

    expect(result.status).toBe('rejected');
    expect(codes(result)).toContain('separation.unidentifiable_transform');
  });

  it('rejects a missing source profile hash', () => {
    const result = separate({
      input: makeGrayInput([0, 85, 170, 255]),
      profile: iccProfile({
        provenance: {
          sourceProfileId: 'source-profile',
          sourceProfileHash: '',
          destinationProfileId: 'destination-profile',
          destinationProfileHash: HASH,
          renderingIntent: 'perceptual',
          blackPointCompensation: false,
        },
      }),
      iccConverter: converter,
    });

    expect(result.status).toBe('rejected');
    expect(codes(result)).toContain('separation.unidentifiable_transform');
  });

  it('rejects an opaque transform without a converter', () => {
    const result = separate({
      input: makeGrayInput([0, 85, 170, 255]),
      profile: iccProfile(),
    });

    expect(result.status).toBe('rejected');
    expect(codes(result)).toContain('separation.unidentifiable_transform');
  });

  it('rejects a converter that throws', () => {
    const result = separate({
      input: makeGrayInput([0, 85, 170, 255]),
      profile: iccProfile(),
      iccConverter: () => {
        throw new Error('converter exploded');
      },
    });

    expect(result.status).toBe('rejected');
    expect(codes(result)).toContain('separation.invalid_transform_output');
  });

  it('rejects a converter that returns the wrong channel count', () => {
    const result = separate({
      input: makeGrayInput([0, 85, 170, 255]),
      profile: iccProfile(),
      iccConverter: () => [],
    });

    expect(result.status).toBe('rejected');
    expect(codes(result)).toContain('separation.invalid_transform_output');
  });

  it('rejects a converter that returns out-of-range values', () => {
    const result = separate({
      input: makeGrayInput([0, 85, 170, 255]),
      profile: iccProfile(),
      iccConverter: () => [[0, 0.5, 1.5, 0]],
    });

    expect(result.status).toBe('rejected');
    expect(codes(result)).toContain('separation.invalid_transform_output');
  });
});

describe('mapping validation', () => {
  it('rejects a channel map that misses an input channel', () => {
    const result = separate({
      input: makeRgbInput(RGB_SAMPLES),
      profile: makeProfile({
        channels: [makeChannel('r', 'red'), makeChannel('g', 'green'), makeChannel('b', 'blue')],
        separation: {
          mode: 'channel-preserving',
          identity: makeIdentity('channel-preserving'),
          channelMap: { r: 'r', g: 'g' },
        },
      }),
    });

    expect(result.status).toBe('rejected');
    expect(codes(result)).toContain('separation.invalid_mapping');
  });

  it('rejects two inputs mapped to the same ink channel', () => {
    const result = separate({
      input: makeRgbInput(RGB_SAMPLES),
      profile: makeProfile({
        channels: [makeChannel('r', 'red'), makeChannel('g', 'green'), makeChannel('b', 'blue')],
        separation: {
          mode: 'channel-preserving',
          identity: makeIdentity('channel-preserving'),
          channelMap: { r: 'r', g: 'r', b: 'b' },
        },
      }),
    });

    expect(result.status).toBe('rejected');
    expect(codes(result)).toContain('separation.invalid_mapping');
  });

  it('rejects a map that targets a mask channel', () => {
    const result = separate({
      input: makeGrayInput([0, 85, 170, 255]),
      profile: makeProfile({
        channels: [makeChannel('k', 'black'), makeChannel('white', 'white', 'mask')],
        separation: {
          mode: 'channel-preserving',
          identity: makeIdentity('channel-preserving'),
          channelMap: { gray: 'white' },
        },
      }),
      maskSources: [
        {
          channelId: 'white',
          identity: 'white-mask',
          width: 2,
          height: 2,
          data: new Uint8Array(4),
        },
      ],
    });

    expect(result.status).toBe('rejected');
    expect(codes(result)).toContain('separation.invalid_mapping');
  });

  it('rejects a tone channel the map does not produce', () => {
    const result = separate({
      input: makeGrayInput([0, 85, 170, 255]),
      profile: makeProfile({
        channels: [makeChannel('k', 'black'), makeChannel('c', 'cyan')],
        separation: {
          mode: 'channel-preserving',
          identity: makeIdentity('channel-preserving'),
          channelMap: { gray: 'k' },
        },
      }),
    });

    expect(result.status).toBe('rejected');
    expect(codes(result)).toContain('separation.channel_count_mismatch');
  });

  it('rejects duplicate declared channel ids instead of reusing the last row', () => {
    const result = separate({
      input: makeGrayInput([255, 0]),
      profile: makeProfile({
        channels: [makeChannel('a', 'black'), makeChannel('a', 'black')],
        separation: {
          mode: 'linear-mixing',
          identity: makeIdentity('linear-mixing'),
          matrix: [[1], [0]],
        },
      }),
    });

    expect(result.status).toBe('rejected');
    expect(codes(result)).toContain('separation.channel_count_mismatch');
    expect('channels' in result).toBe(false);
  });

  it('rejects a map that names an input channel the layout does not have', () => {
    const result = separate({
      input: makeGrayInput([0, 85, 170, 255]),
      profile: makeProfile({
        separation: {
          mode: 'channel-preserving',
          identity: makeIdentity('channel-preserving'),
          channelMap: { gray: 'k', r: 'k' },
        },
      }),
    });

    expect(result.status).toBe('rejected');
    expect(codes(result)).toContain('separation.invalid_mapping');
  });

  it('rejects an unsupported separation mode', () => {
    const result = separate({
      input: makeGrayInput([0, 85, 170, 255]),
      profile: makeProfile({
        separation: {
          mode: 'rgb-to-cmyk',
          identity: makeIdentity('channel-preserving'),
        },
      }),
    });

    expect(result.status).toBe('rejected');
    expect(codes(result)).toContain('separation.invalid_mapping');
  });
});

describe('mask channels', () => {
  const maskProfile = (): ProductionProfile =>
    makeProfile({
      channels: [makeChannel('k', 'black'), makeChannel('white', 'white', 'mask')],
      separation: grayToBlack(),
    });

  const maskSource = {
    channelId: 'white',
    identity: 'dtf-white-mask-v1',
    width: 2,
    height: 2,
    data: Uint8Array.from([0, 255, 128, 255]),
  };

  it('accepts an explicit mask source and scales its coverage', () => {
    const result = separate({
      input: makeGrayInput([0, 85, 170, 255]),
      profile: maskProfile(),
      maskSources: [maskSource],
    });

    expect(result.status).toBe('accepted');
    expect(channelData(result, 'white')).toEqual([0, 65535, 128 * 257, 65535]);
    if (result.status === 'accepted') {
      const white = result.channels.find((channel) => channel.id === 'white');
      expect(white?.transformIdentity).toBe('dtf-white-mask-v1');
    }
  });

  it('rejects a mask channel without a source instead of generating white', () => {
    const result = separate({
      input: makeGrayInput([0, 85, 170, 255]),
      profile: maskProfile(),
    });

    expect(result.status).toBe('rejected');
    expect(codes(result)).toContain('separation.mask_source_missing');
    expect('channels' in result).toBe(false);
  });

  it('rejects a mask source whose dimensions do not match the input', () => {
    const result = separate({
      input: makeGrayInput([0, 85, 170, 255]),
      profile: maskProfile(),
      maskSources: [{ ...maskSource, width: 4 }],
    });

    expect(result.status).toBe('rejected');
    expect(codes(result)).toContain('separation.mask_source_invalid');
  });

  it('rejects two mask sources for the same channel', () => {
    const result = separate({
      input: makeGrayInput([0, 85, 170, 255]),
      profile: maskProfile(),
      maskSources: [maskSource, { ...maskSource, identity: 'second-source' }],
    });

    expect(result.status).toBe('rejected');
    expect(codes(result)).toContain('separation.mask_source_invalid');
  });

  it('rejects a mask source that targets a non-mask channel', () => {
    const result = separate({
      input: makeGrayInput([0, 85, 170, 255]),
      profile: maskProfile(),
      maskSources: [maskSource, { ...maskSource, channelId: 'k' }],
    });

    expect(result.status).toBe('rejected');
    expect(codes(result)).toContain('separation.mask_source_invalid');
  });

  it('accepts a mask-only profile with an explicit source and no separation declaration', () => {
    const result = separate({
      input: makeGrayInput([0, 85, 170, 255]),
      profile: makeProfile({ channels: [makeChannel('white', 'white', 'mask')] }),
      maskSources: [maskSource],
    });

    expect(result.status).toBe('accepted');
    if (result.status === 'accepted') {
      expect(result.channels.map((channel) => channel.id)).toEqual(['white']);
      expect(result.transforms).toEqual([]);
    }
  });
});

describe('transform identity per channel', () => {
  it('records the producing transform on every tone channel and stores it once', () => {
    const result = separate({
      input: makeRgbInput(RGB_SAMPLES),
      profile: makeProfile({ channels: cmykChannels(), separation: cmykMixing() }),
    });

    expect(result.status).toBe('accepted');
    if (result.status === 'accepted') {
      for (const channel of result.channels) {
        expect(channel.transformIdentity).toBe('cmyk-mixing');
      }
      expect(result.transforms).toHaveLength(1);
      expect(result.transforms[0]?.identity.id).toBe('cmyk-mixing');
    }
  });
});

describe('stage preconditions and issue contract', () => {
  it('rejects input that does not match its declared shape', () => {
    const result = separate({
      input: makeGrayInput([0, 85, 170]),
      profile: makeProfile({ separation: grayToBlack() }),
    });

    expect(result.status).toBe('rejected');
    expect(codes(result)).toContain('separation.invalid_input');
  });

  it('rejects a structurally malformed profile instead of throwing', () => {
    const result = separate({
      input: makeGrayInput([0, 85, 170, 255]),
      profile: makeProfile({ channels: undefined }),
    });

    expect(result.status).toBe('rejected');
    expect(codes(result)).toContain('separation.invalid_input');
  });

  it('rejects non-list mask sources instead of throwing', () => {
    const result = separate({
      input: makeGrayInput([0, 85, 170, 255]),
      profile: makeProfile({ separation: grayToBlack() }),
      maskSources: 'not-a-list' as unknown as never,
    });

    expect(result.status).toBe('rejected');
    expect(codes(result)).toContain('separation.invalid_input');
  });

  it('rejects a profile that declares no ink channels', () => {
    const result = separate({
      input: makeGrayInput([0, 85, 170, 255]),
      profile: makeProfile({ channels: [] }),
    });

    expect(result.status).toBe('rejected');
    expect(codes(result)).toContain('separation.channel_count_mismatch');
  });

  it('emits only registered separation-scope issues', () => {
    const results = [
      separate({
        input: makeRgbInput(RGB_SAMPLES),
        profile: makeProfile({ channels: cmykChannels() }),
      }),
      separate({
        input: makeGrayInput([0, 85, 170, 255]),
        profile: makeProfile({
          separation: {
            mode: 'linear-mixing',
            identity: makeIdentity('linear-mixing'),
            matrix: [[Number.NaN]],
          },
        }),
      }),
      separate({ input: makeGrayInput([0, 85, 170, 255]), profile: maskProfileWithoutSource() }),
    ];

    const issues = results.flatMap((result) => result.issues);

    expect(issues.length).toBeGreaterThan(0);
    for (const issue of issues) {
      expect(isRegisteredIssueCode(issue.code)).toBe(true);
      expect(issue.scope).toBe('separation');
      expect(issue.severity).toBe('error');
    }
  });

  function maskProfileWithoutSource(): ProductionProfile {
    return makeProfile({
      channels: [makeChannel('k', 'black'), makeChannel('white', 'white', 'mask')],
      separation: grayToBlack(),
    });
  }
});
