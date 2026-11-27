// @vitest-environment node

import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { IccConverter, ProductionProfile } from '../../src/engines/halftone/contracts';
import { codes, grayProfile, rampInput, rgbInput, rgbProfile, run, toneChannel } from './fixtures';

/**
 * Acceptance matrix, part 1b: separation, the white mask channel, AM profile
 * parameters, transform identity and the declared sampling minimum (spec
 * criteria 3, 4, 5, 23 and 24). Every case drives the single public seam.
 */

const digest = (value: string) => createHash('sha256').update(value).digest('hex');

function whiteMaskChannel() {
  return {
    ...toneChannel({
      id: 'w',
      role: 'white',
      screening: { method: 'am', frequency: 25, angle: 45, dotShape: 'round' },
    }),
    dataKind: 'mask' as const,
  };
}

function maskSource() {
  return {
    channelId: 'w',
    identity: 'white-mask-v1',
    width: 8,
    height: 8,
    data: new Uint8Array(64).fill(255),
  };
}

describe('spec AC3: separation admits only declared modes', () => {
  const fakeConverter: IccConverter = ({ channels }) => [channels[0] ?? []];

  function hashedIccProfile(
    sourceBytes: Uint8Array,
    destinationBytes: Uint8Array,
  ): ProductionProfile {
    return {
      id: 'icc-profile',
      version: '1',
      processKind: 'screen-printing',
      channels: [toneChannel({ id: 'k', role: 'black' })],
      separation: {
        mode: 'icc',
        identity: {
          id: 'fake-icc',
          version: '1',
          type: 'icc',
          parameterHash: digest('fake-icc-parameters'),
          hashAlgorithm: 'sha256',
          canonicalisationVersion: '1',
        },
        provenance: {
          sourceProfileId: 'fake-srgb',
          sourceProfileHash: createHash('sha256').update(sourceBytes).digest('hex'),
          destinationProfileId: 'fake-gray',
          destinationProfileHash: createHash('sha256').update(destinationBytes).digest('hex'),
          renderingIntent: 'relative-colorimetric',
          blackPointCompensation: true,
        },
        sourceProfileBytes: sourceBytes,
        destinationProfileBytes: destinationBytes,
      },
    };
  }

  it('admits channel-preserving, declared linear mixing and an injected ICC transform', () => {
    expect(run({ input: rampInput(), profile: grayProfile() }).status).toBe('completed');

    const mixed = run({ input: rgbInput(), profile: rgbProfile() });
    expect(mixed.status).toBe('completed');
    if (mixed.status === 'completed') expect(mixed.rasters).toHaveLength(3);

    const source = Uint8Array.from([1, 2, 3, 4]);
    const destination = Uint8Array.from([5, 6, 7, 8]);
    const icc = run({
      input: rgbInput(),
      profile: hashedIccProfile(source, destination),
      iccConverter: fakeConverter,
    });
    expect(icc.status).toBe('completed');
    if (icc.status !== 'completed') return;
    const separation = icc.snapshot.separation;
    expect(separation.mode).toBe('icc');
    if (separation.mode !== 'icc') return;
    expect(separation.provenance.sourceProfileId).toBe('fake-srgb');
    expect(separation.sourceProfileBytes).toEqual(source);
    expect(separation.destinationProfileBytes).toEqual(destination);
    expect(icc.snapshot.channels[0]?.separationTransformId).toBe('fake-icc');
  });

  it('rejects implicit RGB-to-CMYK or RGB-to-N conversion', () => {
    const implicit = run({
      input: rgbInput(),
      profile: grayProfile({
        channels: [
          toneChannel({ id: 'c', role: 'cyan' }),
          toneChannel({ id: 'm', role: 'magenta' }),
        ],
        separation: undefined as never,
      }),
    });
    expect(implicit.status).toBe('rejected');
    expect(codes(implicit)).toContain('separation.undeclared_mapping');
  });

  it('rejects wrong matrix dimensions and non-finite coefficients', () => {
    const short = run({
      input: rgbInput(),
      profile: rgbProfile({
        separation: {
          mode: 'linear-mixing',
          identity: {
            id: 'matrix',
            version: '1',
            type: 'linear-mixing',
            parameterHash: digest('matrix'),
            hashAlgorithm: 'sha256',
            canonicalisationVersion: '1',
          },
          matrix: [[1, 0, 0]],
        },
      }),
    });
    expect(short.status).toBe('rejected');
    expect(codes(short)).toContain('separation.invalid_matrix');

    const nonFinite = run({
      input: rgbInput(),
      profile: rgbProfile({
        separation: {
          mode: 'linear-mixing',
          identity: {
            id: 'matrix',
            version: '1',
            type: 'linear-mixing',
            parameterHash: digest('matrix'),
            hashAlgorithm: 'sha256',
            canonicalisationVersion: '1',
          },
          matrix: [
            [1, 0, 0],
            [0, 1, 0],
            [0, 0, Number.NaN],
          ],
        },
      }),
    });
    expect(nonFinite.status).toBe('rejected');
    expect(codes(nonFinite)).toContain('separation.invalid_matrix');
  });

  it('rejects a count or role mismatch and never assumes CMYK', () => {
    const count = run({ input: rgbInput(), profile: grayProfile() });
    expect(count.status).toBe('rejected');
    expect(codes(count)).toContain('separation.channel_count_mismatch');

    const role = run({
      input: rampInput(),
      profile: grayProfile({
        separation: {
          mode: 'channel-preserving',
          identity: {
            id: 'channel-preserving-transform',
            version: '1',
            type: 'channel-preserving',
            parameterHash: digest('channel-preserving'),
            hashAlgorithm: 'sha256',
            canonicalisationVersion: '1',
          },
          channelMap: { gray: 'missing-ink' },
        },
      }),
    });
    expect(role.status).toBe('rejected');
    expect(codes(role)).toContain('separation.invalid_mapping');
  });
});

describe('spec AC4: white mask channels', () => {
  const profile = grayProfile({ channels: [toneChannel(), whiteMaskChannel()] });

  it('requires an explicit mask source and never generates white automatically', () => {
    const result = run({ input: rampInput(), profile });
    expect(result.status).toBe('rejected');
    expect(codes(result)).toEqual(['separation.mask_source_missing']);
    expect(result).not.toHaveProperty('rasters');
  });

  it('records the mask source identity per produced channel', () => {
    const result = run({ input: rampInput(), profile, maskSources: [maskSource()] });
    expect(result.status).toBe('completed');
    if (result.status !== 'completed') return;
    expect(result.rasters.map((raster) => raster.channelId)).toEqual(['k', 'w']);
    expect(result.snapshot.channels.map((channel) => channel.separationTransformId)).toEqual([
      'channel-preserving-transform',
      'white-mask-v1',
    ]);
  });

  it('rejects a white role that does not carry mask data', () => {
    const result = run({
      input: rampInput(),
      profile: grayProfile({
        channels: [toneChannel(), toneChannel({ id: 'w', role: 'white' })],
      }),
    });
    expect(result.status).toBe('rejected');
    expect(codes(result)).toContain('channel.white_requires_mask');
  });
});

describe('spec AC5: AM profile parameters', () => {
  const base = toneChannel();

  it('rejects a missing frequency, angle or dot shape without substituting a default', () => {
    const missing: Array<Record<string, unknown>> = [
      { method: 'am', angle: 0, dotShape: 'round' },
      { method: 'am', frequency: 25, dotShape: 'round' },
      { method: 'am', frequency: 25, angle: 0 },
    ];
    for (const screening of missing) {
      const result = run({
        input: rampInput(),
        profile: grayProfile({ channels: [{ ...base, screening: screening as never }] }),
      });
      expect(result.status).toBe('rejected');
      expect(codes(result)).toEqual(['profile.missing_am_parameter']);
      expect(result).not.toHaveProperty('snapshot');
    }
  });

  it('rejects a non-AM method as unsupported', () => {
    const result = run({
      input: rampInput(),
      profile: grayProfile({ channels: [{ ...base, screening: { method: 'fm' } as never }] }),
    });
    expect(result.status).toBe('rejected');
    expect(codes(result)).toEqual(['profile.unsupported_method']);
  });

  it('rejects an unknown dot shape', () => {
    const result = run({
      input: rampInput(),
      profile: grayProfile({
        channels: [
          {
            ...base,
            screening: { method: 'am', frequency: 25, angle: 0, dotShape: 'hexagon' } as never,
          },
        ],
      }),
    });
    expect(result.status).toBe('rejected');
    expect(codes(result)).toEqual(['profile.invalid_am_parameter']);
  });
});

describe('spec AC23: transform identity and provenance', () => {
  it('rejects a transform that cannot supply a stable identity', () => {
    const profile = grayProfile({
      separation: {
        mode: 'channel-preserving',
        identity: {
          id: 'channel-preserving-transform',
          version: '1',
          type: 'channel-preserving',
          parameterHash: '',
          hashAlgorithm: 'sha256',
          canonicalisationVersion: '1',
        },
        channelMap: { gray: 'k' },
      },
    });
    const result = run({ input: rampInput(), profile });
    expect(result.status).toBe('rejected');
    expect(codes(result)).toEqual(['separation.unidentifiable_transform']);
  });

  it('rejects an ICC transform with no injected converter', () => {
    const result = run({
      input: rgbInput(),
      profile: {
        id: 'icc-without-converter',
        version: '1',
        processKind: 'screen-printing',
        channels: [toneChannel({ id: 'k', role: 'black' })],
        separation: {
          mode: 'icc',
          identity: {
            id: 'icc',
            version: '1',
            type: 'icc',
            parameterHash: digest('icc'),
            hashAlgorithm: 'sha256',
            canonicalisationVersion: '1',
          },
          provenance: {
            sourceProfileId: 'a',
            sourceProfileHash: digest('a'),
            destinationProfileId: 'b',
            destinationProfileHash: digest('b'),
            renderingIntent: 'perceptual',
            blackPointCompensation: false,
          },
        },
      },
    });
    expect(result.status).toBe('rejected');
    expect(codes(result)).toEqual(['separation.unidentifiable_transform']);
  });

  it('records the producing transform on every channel', () => {
    const result = run({
      input: rampInput(),
      profile: grayProfile({ channels: [toneChannel(), whiteMaskChannel()] }),
      maskSources: [maskSource()],
    });
    expect(result.status).toBe('completed');
    if (result.status !== 'completed') return;
    expect(result.snapshot.channels).toHaveLength(2);
    for (const channel of result.snapshot.channels) {
      expect(channel.separationTransformId.length).toBeGreaterThan(0);
    }
    expect(result.channels.map((channel) => channel.separationTransformId)).toEqual(
      result.snapshot.channels.map((channel) => channel.separationTransformId),
    );
  });
});

describe('spec AC24: declared input sampling minimum', () => {
  it('emits no warning without a declared minimum', () => {
    const result = run({ input: rampInput(), profile: grayProfile() });
    expect(result.status).toBe('completed');
    expect(codes(result)).not.toContain('input.low_resolution');
    if (result.status !== 'completed') return;
    expect(result.snapshot.input.minimumInputSamplesPerScreenLine).toBeNull();
  });

  it('warns when the declared minimum is above the actual ratio and records the basis', () => {
    const result = run({
      input: rampInput(),
      profile: grayProfile({ minimumInputSamplesPerScreenLine: 8 }),
    });
    expect(result.status).toBe('completed');
    expect(codes(result)).toEqual(['input.low_resolution']);
    if (result.status !== 'completed') return;
    expect(result.snapshot.input.samplesPerScreenLine).toBe(4);
    expect(result.snapshot.input.minimumInputSamplesPerScreenLine).toBe(8);
    expect(result.issues[0]?.scope).toBe('input');
  });

  it('applies no universal threshold: a low declared minimum stays silent', () => {
    const result = run({
      input: rampInput(),
      profile: grayProfile({ minimumInputSamplesPerScreenLine: 1 }),
    });
    expect(result.status).toBe('completed');
    expect(codes(result)).not.toContain('input.low_resolution');
    if (result.status !== 'completed') return;
    expect(result.snapshot.input.minimumInputSamplesPerScreenLine).toBe(1);
  });
});
