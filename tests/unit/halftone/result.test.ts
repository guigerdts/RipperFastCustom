import { describe, expect, it } from 'vitest';

import type {
  ChannelDataKind,
  ContinuousToneInput,
  IccConverter,
  InkChannel,
  ProductionProfile,
  SeparationDeclaration,
  TransformIdentity,
} from '../../../src/engines/halftone/contracts';
import { assembleScreeningResult } from '../../../src/engines/halftone/result';
import { snapshotCanonicalText, verifySnapshot } from '../../../src/engines/halftone/snapshot';
import { sha256Hex } from '../../../src/engines/halftone/canonical';

function makeIdentity(
  type: 'channel-preserving' | 'icc',
  hash = 'a'.repeat(64),
): TransformIdentity {
  return {
    id: `${type}-transform`,
    version: '1',
    type,
    parameterHash: hash,
    hashAlgorithm: 'sha256',
    canonicalisationVersion: '1',
  };
}

function makeChannel(overrides: Partial<InkChannel> = {}): InkChannel {
  return {
    id: 'k',
    role: 'black',
    dataKind: 'tone' as ChannelDataKind,
    screening: { method: 'am', frequency: 25, angle: 0, dotShape: 'round' },
    ...overrides,
  };
}

function grayToBlack(): SeparationDeclaration {
  return {
    mode: 'channel-preserving',
    identity: makeIdentity('channel-preserving'),
    channelMap: { gray: 'k' },
  };
}

function makeInput(width = 4, height = 4, ppi = 100): ContinuousToneInput {
  const data = new Uint8Array(width * height);
  for (let index = 0; index < data.length; index += 1) {
    data[index] = (index * 17) % 256;
  }
  return { width, height, ppi, bitDepth: 8, layout: 'grayscale', data };
}

function makeProfile(overrides: Partial<ProductionProfile> = {}): ProductionProfile {
  return {
    id: 'profile',
    version: '1',
    processKind: 'screen-printing',
    channels: [makeChannel()],
    separation: grayToBlack(),
    ...overrides,
  };
}

function run(
  overrides: {
    input?: ContinuousToneInput;
    profile?: ProductionProfile;
    dpi?: number;
    tiles?: readonly { x: number; y: number; width: number; height: number }[];
    isCancelled?: () => boolean;
    iccConverter?: IccConverter;
  } = {},
) {
  return assembleScreeningResult({
    request: {
      input: overrides.input ?? makeInput(),
      profile: overrides.profile ?? makeProfile(),
      output: { dpi: overrides.dpi ?? 100 },
    },
    tiles: overrides.tiles,
    isCancelled: overrides.isCancelled,
    iccConverter: overrides.iccConverter,
  });
}

describe('result envelope', () => {
  it('completes with one binary raster per channel at the output resolution', () => {
    const result = run();
    expect(result.status).toBe('completed');
    if (result.status !== 'completed') return;

    expect(result.rasters).toHaveLength(1);
    const raster = result.rasters[0];
    expect(raster?.channelId).toBe('k');
    expect(raster?.width).toBe(4);
    expect(raster?.height).toBe(4);
    expect(raster?.dpi).toBe(100);
    expect(raster?.bitsPerPixel).toBe(1);
    expect(raster?.data).toHaveLength(16);
    for (const value of raster?.data ?? []) expect([0, 1]).toContain(value);
    expect(result.channels[0]?.channelId).toBe('k');
    expect(result.snapshot.channels[0]?.channelId).toBe('k');
  });

  it('rejects with structured diagnostics and no raster or snapshot', () => {
    const broken = { ...makeInput(), width: 0 } as ContinuousToneInput;
    const result = run({ input: broken });

    expect(result.status).toBe('rejected');
    expect('rasters' in result).toBe(false);
    expect('snapshot' in result).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
    const issue = result.issues[0];
    expect(issue?.code).toBe('input.invalid_dimensions');
    expect(issue?.severity).toBe('error');
    expect(issue?.context.parameter).toBe('dimensions');
  });

  it('never presents a cancelled run as completed', () => {
    const result = run({ isCancelled: () => true });

    expect(result.status).toBe('cancelled');
    expect('rasters' in result).toBe(false);
    expect('snapshot' in result).toBe(false);
    expect(result.issues).toEqual([]);
  });
});

describe('self-contained snapshot', () => {
  it('embeds effective values, not only hashes', () => {
    const result = run();
    if (result.status !== 'completed') throw new Error('expected a completed run');
    const snapshot = result.snapshot;

    expect(snapshot.engine.quantisationRule).toBe('floor(x*65535+0.5)/65535');
    expect(snapshot.separation.mode).toBe('channel-preserving');
    if (snapshot.separation.mode === 'channel-preserving') {
      expect(snapshot.separation.channelMap).toEqual({ gray: 'k' });
    }
    expect(snapshot.channels[0]?.frequency).toBe(25);
    expect(snapshot.channels[0]?.angle).toBe(0);
    expect(snapshot.channels[0]?.dotShape).toBe('round');
    expect(snapshot.channels[0]?.trc.points.length).toBeGreaterThan(0);
    expect(snapshot.channels[0]?.limits).toEqual({ a_wf: 0, a_vf: 1 });
    expect(snapshot.channels[0]?.cellPixelCount).toBeGreaterThan(0);
    expect(typeof snapshot.channels[0]?.addressableCoverageCount).toBe('number');
    expect(snapshot.lattice.pitch).toBe(4);
    expect(snapshot.lattice.angularConvention).toBe('9-oclock-clockwise');
    expect(snapshot.canvas.roundingRule).toBe('floor(x+0.5)');
    expect(snapshot.input.samplesPerScreenLine).toBe(4);
    expect(snapshot.preview.enabled).toBe(false);
  });

  it('verifies its own hash and rejects a tampered record', () => {
    const result = run();
    if (result.status !== 'completed') throw new Error('expected a completed run');

    expect(verifySnapshot(result.snapshot).ok).toBe(true);

    const tampered = { ...result.snapshot, output: { dpi: 200, lpi: 25 } };
    const verification = verifySnapshot(tampered);
    expect(verification.ok).toBe(false);
    expect(verification.issues[0]?.code).toBe('output.snapshot_invalid');
  });

  it('is immutable against later profile and request mutations', () => {
    const input = makeInput();
    const profile = makeProfile();
    const result = run({ input, profile });
    if (result.status !== 'completed') throw new Error('expected a completed run');

    const before = result.snapshot.hash;
    const beforeText = snapshotCanonicalText(result.snapshot);

    // Mutate the caller's objects after the run.
    (profile as { id: string }).id = 'other-profile';
    (profile.channels[0] as { role: string }).role = 'cyan';
    input.data[0] = 255;

    expect(result.snapshot.hash).toBe(before);
    expect(snapshotCanonicalText(result.snapshot)).toBe(beforeText);
    expect(result.snapshot.profile.id).toBe('profile');
    expect(result.snapshot.channels[0]?.role).toBe('black');
    expect(verifySnapshot(result.snapshot).ok).toBe(true);
  });

  it('contains no timestamp, absolute path or host identifier', () => {
    const result = run();
    if (result.status !== 'completed') throw new Error('expected a completed run');
    const text = snapshotCanonicalText(result.snapshot);

    expect(text).not.toMatch(/\/root|\/home|\/tmp|[A-Za-z]:\\\\/);
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    expect(text.toLowerCase()).not.toContain('timestamp');
    expect(text.toLowerCase()).not.toContain('hostname');
  });
});

describe('canonical determinism and sensitivity', () => {
  it('produces identical bytes and hash for the same effective parameters', () => {
    const first = run();
    const second = run();
    if (first.status !== 'completed' || second.status !== 'completed') {
      throw new Error('expected two completed runs');
    }

    expect(snapshotCanonicalText(first.snapshot)).toBe(snapshotCanonicalText(second.snapshot));
    expect(first.snapshot.hash).toBe(second.snapshot.hash);
    expect(Array.from(first.rasters[0]?.data ?? [])).toEqual(
      Array.from(second.rasters[0]?.data ?? []),
    );
  });

  it('changes the hash when any effective parameter changes', () => {
    const baseline = run();
    if (baseline.status !== 'completed') throw new Error('expected a completed run');

    const variants = [
      run({ profile: makeProfile({ channels: [makeChannel({ role: 'cyan' })] }) }),
      run({
        profile: makeProfile({
          channels: [
            makeChannel({
              screening: { method: 'am', frequency: 25, angle: 15, dotShape: 'round' },
            }),
          ],
        }),
      }),
      run({
        profile: makeProfile({
          channels: [
            makeChannel({
              screening: { method: 'am', frequency: 25, angle: 0, dotShape: 'square' },
            }),
          ],
        }),
      }),
      run({
        profile: makeProfile({ channels: [makeChannel({ limits: { a_wf: 0.1, a_vf: 0.9 } })] }),
      }),
      run({ dpi: 200 }),
    ];

    for (const variant of variants) {
      if (variant.status !== 'completed') throw new Error('expected a completed variant');
      expect(variant.snapshot.hash).not.toBe(baseline.snapshot.hash);
    }
  });

  it('reconstructs every effective parameter from the snapshot and re-runs identically', () => {
    const result = run();
    if (result.status !== 'completed') throw new Error('expected a completed run');
    const snapshot = result.snapshot;

    // The snapshot alone names the parameters the run used.
    expect(snapshot.output.dpi).toBe(100);
    expect(snapshot.input.ppi).toBe(100);
    expect(snapshot.input.layout).toBe('grayscale');
    expect(snapshot.profile.id).toBe('profile');
    expect(snapshot.process.screeningMethod).toBe('am');

    // Re-running with those parameters reproduces the same output and hash.
    const rerun = run({
      dpi: snapshot.output.dpi,
      input: makeInput(snapshot.input.width, snapshot.input.height, snapshot.input.ppi),
      profile: makeProfile({
        id: snapshot.profile.id,
        channels: [
          makeChannel({
            screening: {
              method: 'am',
              frequency: snapshot.channels[0]?.frequency ?? 0,
              angle: snapshot.channels[0]?.angle ?? 0,
              dotShape: 'round',
            },
          }),
        ],
      }),
    });
    if (rerun.status !== 'completed') throw new Error('expected a completed rerun');

    expect(rerun.snapshot.hash).toBe(snapshot.hash);
    expect(Array.from(rerun.rasters[0]?.data ?? [])).toEqual(
      Array.from(result.rasters[0]?.data ?? []),
    );
  });
});

describe('ICC profile capture', () => {
  const sourceBytes = Uint8Array.from([1, 2, 3, 4, 5]);
  const destinationBytes = Uint8Array.from([9, 8, 7]);
  const sourceHash = sha256Hex(sourceBytes);
  const destinationHash = sha256Hex(destinationBytes);

  function iccProfile(bytes?: {
    source?: Uint8Array;
    destination?: Uint8Array;
    sourceHash?: string;
  }): ProductionProfile {
    return makeProfile({
      separation: {
        mode: 'icc',
        identity: makeIdentity('icc'),
        provenance: {
          sourceProfileId: 'srgb',
          sourceProfileHash: bytes?.sourceHash ?? sourceHash,
          destinationProfileId: 'press',
          destinationProfileHash: destinationHash,
          renderingIntent: 'relative-colorimetric',
          blackPointCompensation: false,
        },
        sourceProfileBytes: bytes?.source,
        destinationProfileBytes: bytes?.destination,
      },
    });
  }

  const converter: IccConverter = () => [Array.from({ length: 16 }, (_, index) => index / 16)];

  it('embeds the profile bytes in the snapshot', () => {
    const result = run({
      profile: iccProfile({ source: sourceBytes, destination: destinationBytes }),
      iccConverter: converter,
    });
    if (result.status !== 'completed') throw new Error('expected a completed run');

    const separation = result.snapshot.separation;
    if (separation.mode !== 'icc') throw new Error('expected an icc separation');
    expect(Array.from(separation.sourceProfileBytes)).toEqual(Array.from(sourceBytes));
    expect(Array.from(separation.destinationProfileBytes)).toEqual(Array.from(destinationBytes));
    expect(sha256Hex(separation.sourceProfileBytes)).toBe(separation.provenance.sourceProfileHash);
  });

  it('rejects a run whose profile bytes were not captured', () => {
    const result = run({ profile: iccProfile(), iccConverter: converter });

    expect(result.status).toBe('rejected');
    expect('rasters' in result).toBe(false);
    expect(
      result.issues.some((issue) => issue.code === 'separation.unreproducible_transform'),
    ).toBe(true);
  });

  it('is immutable against later ICC profile byte mutations', () => {
    const mutableSource = Uint8Array.from(sourceBytes);
    const result = run({
      profile: iccProfile({ source: mutableSource, destination: destinationBytes }),
      iccConverter: converter,
    });
    if (result.status !== 'completed') throw new Error('expected a completed run');

    const beforeHash = result.snapshot.hash;
    const beforeText = snapshotCanonicalText(result.snapshot);

    mutableSource[0] = 255;

    expect(result.snapshot.hash).toBe(beforeHash);
    expect(snapshotCanonicalText(result.snapshot)).toBe(beforeText);
    if (result.snapshot.separation.mode !== 'icc') throw new Error('expected an icc separation');
    expect(Array.from(result.snapshot.separation.sourceProfileBytes)).toEqual(
      Array.from(sourceBytes),
    );
    expect(verifySnapshot(result.snapshot).ok).toBe(true);
  });

  it('rejects a run whose profile bytes do not match the recorded hash', () => {
    const result = run({
      profile: iccProfile({
        source: Uint8Array.from([0, 0, 0]),
        destination: destinationBytes,
      }),
      iccConverter: converter,
    });

    expect(result.status).toBe('rejected');
    expect(
      result.issues.some((issue) => issue.code === 'separation.unreproducible_transform'),
    ).toBe(true);
  });
});

describe('whole-image versus tiled identity', () => {
  const input = makeInput(16, 16, 100);

  function rasterOf(result: ReturnType<typeof run>): number[] {
    if (result.status !== 'completed') throw new Error('expected a completed run');
    return Array.from(result.rasters[0]?.data ?? []);
  }

  it('is byte-identical across uniform and non-uniform tilings', () => {
    const whole = run({ input });
    const quadrants = run({
      input,
      tiles: [
        { x: 0, y: 0, width: 8, height: 8 },
        { x: 8, y: 0, width: 8, height: 8 },
        { x: 0, y: 8, width: 8, height: 8 },
        { x: 8, y: 8, width: 8, height: 8 },
      ],
    });
    const strips = run({
      input,
      tiles: [
        { x: 0, y: 0, width: 16, height: 5 },
        { x: 0, y: 5, width: 16, height: 7 },
        { x: 0, y: 12, width: 16, height: 4 },
      ],
    });
    const ragged = run({
      input,
      tiles: [
        { x: 0, y: 0, width: 3, height: 16 },
        { x: 3, y: 0, width: 9, height: 7 },
        { x: 12, y: 0, width: 4, height: 16 },
        { x: 3, y: 7, width: 9, height: 9 },
      ],
    });

    const expected = rasterOf(whole);
    expect(rasterOf(quadrants)).toEqual(expected);
    expect(rasterOf(strips)).toEqual(expected);
    expect(rasterOf(ragged)).toEqual(expected);

    if (whole.status !== 'completed' || ragged.status !== 'completed') {
      throw new Error('expected completed runs');
    }
    expect(ragged.snapshot.hash).toBe(whole.snapshot.hash);
    expect(ragged.channels[0]?.summaries.screened).toEqual(whole.channels[0]?.summaries.screened);
  });

  it('writes a tile exactly where the whole run writes it', () => {
    const whole = run({ input });
    const tile = { x: 4, y: 6, width: 5, height: 3 };
    const only = run({ input, tiles: [tile] });

    const wholeRaster = rasterOf(whole);
    const tileRaster = rasterOf(only);

    for (let y = 0; y < 16; y += 1) {
      for (let x = 0; x < 16; x += 1) {
        const inside =
          x >= tile.x && x < tile.x + tile.width && y >= tile.y && y < tile.y + tile.height;
        const index = y * 16 + x;
        expect(tileRaster[index]).toBe(inside ? wholeRaster[index] : 0);
      }
    }
  });
});

describe('snapshot golden and bounds', () => {
  function goldenInput(): ContinuousToneInput {
    const data = new Uint8Array(256);
    for (let index = 0; index < data.length; index += 1) data[index] = (index * 37) % 256;
    return { width: 16, height: 16, ppi: 100, bitDepth: 8, layout: 'grayscale', data };
  }

  function goldenProfile(): ProductionProfile {
    return {
      id: 'golden-profile',
      version: '1',
      processKind: 'screen-printing',
      channels: [
        makeChannel({
          screening: { method: 'am', frequency: 25, angle: 0, dotShape: 'round' },
          trc: {
            points: [
              { input: 0, output: 0 },
              { input: 1, output: 1 },
            ],
            interpolation: 'linear',
          },
          limits: { a_wf: 0, a_vf: 1 },
        }),
      ],
      separation: grayToBlack(),
    };
  }

  it('pins one canonical byte sequence and its SHA-256', () => {
    const result = assembleScreeningResult({
      request: { input: goldenInput(), profile: goldenProfile(), output: { dpi: 100 } },
    });
    if (result.status !== 'completed') throw new Error('expected a completed run');

    const text = snapshotCanonicalText(result.snapshot);
    expect(result.snapshot.hash).toBe(
      'cab7c3a948b8a0ca9ad2f38ec0be357351ecf844e9e287bf01b209ee9e393baa',
    );
    expect(text.length).toBe(2424);
    expect(text.startsWith('{"canonicalisationVersion":"1","canvas":')).toBe(true);
    expect(text).toContain('"quantisationRule":"floor(x*65535+0.5)/65535"');
    expect(text).toContain('"cellPixelCount":0x4030000000000000');
    expect(text).toContain('"addressableCoverageCount":0x4010000000000000');
  });

  it('carries no raster payload and stays within a bounded size', () => {
    const result = assembleScreeningResult({
      request: { input: goldenInput(), profile: goldenProfile(), output: { dpi: 100 } },
    });
    if (result.status !== 'completed') throw new Error('expected a completed run');

    const text = snapshotCanonicalText(result.snapshot);
    expect(Object.keys(result.snapshot)).not.toContain('rasters');
    expect(Object.keys(result.snapshot)).not.toContain('data');
    // 256 raster bytes would appear as a 344-character base64 payload.
    expect(text).not.toContain('#b64:');
    expect(text.length).toBeLessThan(8192);
  });
});

describe('separation descriptors in the snapshot', () => {
  it('embeds the linear-mixing matrix and transfer functions', () => {
    const data = Uint8Array.from([0, 64, 128, 255]);
    const profile: ProductionProfile = {
      id: 'mix',
      version: '2',
      processKind: 'screen-printing',
      channels: [makeChannel({ id: 'c', role: 'cyan' }), makeChannel({ id: 'm', role: 'magenta' })],
      separation: {
        mode: 'linear-mixing',
        identity: {
          id: 'mix-transform',
          version: '3',
          type: 'linear-mixing',
          parameterHash: 'b'.repeat(64),
          hashAlgorithm: 'sha256',
          canonicalisationVersion: '1',
        },
        matrix: [[1], [0.5]],
        transferFunctions: {
          c: {
            points: [
              { input: 0, output: 0 },
              { input: 1, output: 0.9 },
            ],
            interpolation: 'linear',
          },
        },
      },
    };

    const result = assembleScreeningResult({
      request: {
        input: { width: 2, height: 2, ppi: 100, bitDepth: 8, layout: 'grayscale', data },
        profile,
        output: { dpi: 100 },
      },
    });
    if (result.status !== 'completed') throw new Error(JSON.stringify(result.issues));

    const separation = result.snapshot.separation;
    expect(separation.mode).toBe('linear-mixing');
    if (separation.mode !== 'linear-mixing') return;
    expect(separation.matrix).toEqual([[1], [0.5]]);
    expect(separation.transferFunctions.c?.points).toEqual([
      { input: 0, output: 0 },
      { input: 1, output: 0.9 },
    ]);
    expect(separation.identity.parameterHash).toBe('b'.repeat(64));
    expect(separation.identity.version).toBe('3');
  });
});

describe('multi-channel effective values', () => {
  it('records a null shared LPI when channels screen at different frequencies', () => {
    const profile: ProductionProfile = {
      id: 'multi',
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
          screening: { method: 'am', frequency: 50, angle: 45, dotShape: 'round' },
        }),
        makeChannel({
          id: 'y',
          role: 'yellow',
          screening: { method: 'am', frequency: 35, angle: 75, dotShape: 'round' },
        }),
      ],
      separation: {
        mode: 'channel-preserving',
        identity: {
          id: 'rgb-split',
          version: '1',
          type: 'channel-preserving',
          parameterHash: 'c'.repeat(64),
          hashAlgorithm: 'sha256',
          canonicalisationVersion: '1',
        },
        channelMap: { r: 'c', g: 'm', b: 'y' },
      },
    };

    const result = assembleScreeningResult({
      request: {
        input: {
          width: 8,
          height: 8,
          ppi: 100,
          bitDepth: 8,
          layout: 'rgb',
          data: new Uint8Array(8 * 8 * 3).fill(128),
        },
        profile,
        output: { dpi: 100 },
      },
    });
    if (result.status !== 'completed') throw new Error(JSON.stringify(result.issues));

    expect(result.rasters).toHaveLength(3);
    expect(result.snapshot.output.lpi).toBeNull();
    expect(result.snapshot.input.samplesPerScreenLine).toBeNull();
    expect(result.snapshot.channels.map((channel) => channel.frequency)).toEqual([25, 50, 35]);
    expect(result.snapshot.channels.map((channel) => channel.angle)).toEqual([15, 45, 75]);
    expect(result.snapshot.lattice.referenceChannelId).toBe('c');
  });
});

describe('tile validation and cancellation', () => {
  it('rejects an unusable tile instead of silently ignoring it', () => {
    const result = run({ tiles: [{ x: 0, y: 0, width: 0, height: 4 }] });

    expect(result.status).toBe('rejected');
    expect(result.issues[0]?.code).toBe('output.invalid_dimension');
    expect(result.issues[0]?.context.parameter).toBe('tiles');
  });

  it('returns a cancelled envelope with the diagnostics collected so far', () => {
    let calls = 0;
    const result = run({
      isCancelled: () => {
        calls += 1;
        return calls > 1;
      },
    });

    expect(result.status).toBe('cancelled');
    expect('rasters' in result).toBe(false);
    expect('snapshot' in result).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'channel.limits_identity')).toBe(true);
  });
});
