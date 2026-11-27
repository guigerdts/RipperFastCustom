// @vitest-environment node

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import type {
  CompletedResult,
  ContinuousToneInput,
  IccConverter,
  IccProvenance,
  ProductionProfile,
  ScreeningResult,
  SeparationDeclaration,
  TransformIdentity,
} from '../../src/engines/halftone/contracts';
import { CANONICALISATION_VERSION } from '../../src/engines/halftone/contracts/separation';
import {
  recomputeSnapshotHash,
  snapshotCanonicalText,
  verifyEmbeddedProfiles,
  verifySnapshot,
} from '../../src/engines/halftone/snapshot';
import {
  codes,
  flatInput,
  fourChannelProfile,
  grayProfile,
  graySeparation,
  identityCurve,
  rampInput,
  rasterDigest,
  rgbInput,
  run,
  toneChannel,
  transformIdentity,
  type FixtureProfile,
} from './fixtures';

/**
 * Acceptance matrix, part 3: the snapshot as the effective record (spec
 * criteria 16, 17 and 27). A completed run must be reconstructable from the
 * snapshot and the same input bytes only: no editable profile, no mutable
 * external file, no host state.
 */

const sha256 = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');

function completed(result: ScreeningResult): CompletedResult {
  expect(result.status).toBe('completed');
  if (result.status !== 'completed') throw new Error('expected a completed result');
  return result;
}

function collectKeys(value: unknown, keys: string[] = []): string[] {
  if (value === null || typeof value !== 'object') return keys;
  if (value instanceof Uint8Array) return keys;
  for (const [key, child] of Object.entries(value)) {
    keys.push(key);
    collectKeys(child, keys);
  }
  return keys;
}

/** Rebuilds a profile from snapshot values only, never from the original profile. */
function identityFromSnapshot(identity: {
  readonly id: string;
  readonly version: string;
  readonly type: string;
  readonly parameterHash: string;
  readonly hashAlgorithm: TransformIdentity['hashAlgorithm'];
  readonly canonicalisationVersion: string;
}): TransformIdentity {
  return {
    id: identity.id,
    version: identity.version,
    type: identity.type as TransformIdentity['type'],
    parameterHash: identity.parameterHash,
    hashAlgorithm: identity.hashAlgorithm,
    canonicalisationVersion: identity.canonicalisationVersion,
  };
}

function profileFromSnapshot(snapshot: CompletedResult['snapshot']): FixtureProfile {
  const channels = snapshot.channels.map((channel) => ({
    id: channel.channelId,
    role: channel.role,
    dataKind: channel.dataKind,
    screening: {
      method: 'am' as const,
      frequency: channel.frequency,
      angle: channel.angle,
      dotShape: channel.dotShape as 'round',
    },
    trc: {
      points: channel.trc.points.map((point) => ({ input: point.input, output: point.output })),
      interpolation: channel.trc.interpolation,
    },
    limits: { a_wf: channel.limits.a_wf, a_vf: channel.limits.a_vf },
  }));

  const separation = snapshot.separation;
  let declaration: SeparationDeclaration;
  if (separation.mode === 'channel-preserving') {
    declaration = {
      mode: 'channel-preserving',
      identity: identityFromSnapshot(separation.identity),
      channelMap: { ...separation.channelMap },
    };
  } else if (separation.mode === 'linear-mixing') {
    declaration = {
      mode: 'linear-mixing',
      identity: identityFromSnapshot(separation.identity),
      matrix: separation.matrix.map((row) => [...row]),
    };
  } else {
    throw new Error('an ICC separation is reconstructed with its injected converter, not here');
  }

  return {
    id: snapshot.profile.id,
    version: snapshot.profile.version,
    processKind: snapshot.process.kind,
    channels,
    separation: declaration,
  };
}

describe('spec AC16: the snapshot embeds effective values', () => {
  it('records role mapping, TRC points, limits, lattice and boundary conventions', () => {
    const declared = fourChannelProfile();
    const result = completed(run({ input: rgbInput(), profile: declared }));
    const snapshot = result.snapshot;

    expect(snapshot.separation.mode).toBe('linear-mixing');
    if (snapshot.separation.mode !== 'linear-mixing') return;
    if (declared.separation === undefined || declared.separation.mode !== 'linear-mixing') {
      throw new Error('declared mixing expected');
    }
    expect(snapshot.separation.matrix).toEqual(declared.separation.matrix);
    expect(snapshot.separation.identity.type).toBe('linear-mixing');

    expect(snapshot.channels).toHaveLength(4);
    for (const channel of snapshot.channels) {
      expect(channel.trc.points).toEqual([
        { input: 0, output: 0 },
        { input: 1, output: 1 },
      ]);
      expect(channel.limits).toEqual({ a_wf: 0, a_vf: 1 });
      expect(channel.trcApplied).toBe(true);
      expect(channel.limitsApplied).toBe(true);
      expect(Number.isInteger(channel.cellPixelCount)).toBe(true);
      expect(Number.isInteger(channel.addressableCoverageCount)).toBe(true);
    }
    // The unrotated channel has fully visible cells, so its addressability is real.
    expect(snapshot.channels[0]?.cellPixelCount).toBeGreaterThan(0);
    expect(snapshot.channels[0]?.addressableCoverageCount).toBeGreaterThan(0);
    expect(snapshot.channels[0]?.addressableCoverageCount).not.toBe(
      snapshot.channels[0]?.cellPixelCount,
    );

    expect(snapshot.lattice.angularConvention).toBe('9-oclock-clockwise');
    expect(snapshot.lattice.pixelCentreConvention).toBe('centre-at-half-integer');
    expect(snapshot.lattice.boundaryPolicy).toBe('edge-clamp-with-clipped-flag');
    expect(snapshot.canvas.roundingRule).toBe('floor(x+0.5)');
    expect(snapshot.input.sourceKind).toBe('continuous-tone');
    expect(snapshot.overrides.preparedArtwork).toBeNull();
  });

  it('records the declared role mapping per input channel', () => {
    const mapped = completed(
      run({
        input: rgbInput(),
        profile: {
          id: 'rgb-mapped',
          version: '1',
          processKind: 'screen-printing',
          channels: [
            toneChannel({ id: 'c', role: 'cyan' }),
            toneChannel({ id: 'm', role: 'magenta' }),
            toneChannel({ id: 'y', role: 'yellow' }),
          ],
          separation: {
            mode: 'channel-preserving',
            identity: transformIdentity(),
            channelMap: { r: 'c', g: 'm', b: 'y' },
          },
        },
      }),
    );
    const separation = mapped.snapshot.separation;
    expect(separation.mode).toBe('channel-preserving');
    if (separation.mode !== 'channel-preserving') return;
    expect(separation.channelMap).toEqual({ r: 'c', g: 'm', b: 'y' });
  });

  it('carries no timestamp, path or host identifier', () => {
    const result = completed(run({ input: rampInput(), profile: grayProfile() }));
    const keys = collectKeys(result.snapshot);
    const forbidden =
      /timestamp|createdAt|updatedAt|modifiedAt|hostname|username|userName|sessionId|\bcwd\b|absolutePath/i;

    expect(keys.filter((key) => forbidden.test(key))).toEqual([]);

    const text = snapshotCanonicalText(result.snapshot);
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    expect(text).not.toContain(process.cwd());
    expect(text).not.toContain('/root/');
    expect(text).not.toMatch(/[A-Za-z]:\\\\/);
  });

  it('stays immutable against later profile and request mutations', () => {
    const input = rampInput();
    const profile = grayProfile();
    const result = completed(run({ input, profile }));
    const before = snapshotCanonicalText(result.snapshot);

    (profile.channels[0]?.screening as { frequency: number }).frequency = 999;
    (profile.separation as { channelMap: Record<string, string> }).channelMap.gray = 'mutated';
    input.data[0] = 7;

    expect(snapshotCanonicalText(result.snapshot)).toBe(before);
    expect(recomputeSnapshotHash(result.snapshot)).toBe(result.snapshot.hash);
    expect(Object.isFrozen(result.snapshot)).toBe(true);
    expect(Object.isFrozen(result.snapshot.channels)).toBe(true);
    expect(Object.isFrozen(result.snapshot.channels[0])).toBe(true);
    expect(Object.isFrozen(result.snapshot.canvas)).toBe(true);
  });
});

describe('spec AC17: reconstruction from the snapshot', () => {
  it('reproduces the same hash and rasters for a channel-preserving run', () => {
    const input = rampInput();
    const first = completed(run({ input, profile: grayProfile() }));
    const rebuilt = completed(run({ input, profile: profileFromSnapshot(first.snapshot) }));

    expect(rebuilt.snapshot.hash).toBe(first.snapshot.hash);
    expect(rasterDigest(rebuilt)).toBe(rasterDigest(first));
    expect(verifySnapshot(first.snapshot)).toEqual({ ok: true, issues: [] });
    expect(recomputeSnapshotHash(first.snapshot)).toBe(first.snapshot.hash);
  });

  it('reproduces the same hash and rasters for a declared linear-mixing run', () => {
    const input = rgbInput();
    const first = completed(run({ input, profile: fourChannelProfile() }));
    const rebuilt = completed(run({ input, profile: profileFromSnapshot(first.snapshot) }));

    expect(rebuilt.snapshot.hash).toBe(first.snapshot.hash);
    expect(rasterDigest(rebuilt)).toBe(rasterDigest(first));
  });

  it('embeds the ICC profile bytes and verifies their content addressing', () => {
    const source = Uint8Array.from([1, 2, 3, 4]);
    const destination = Uint8Array.from([5, 6, 7, 8]);
    const converter: IccConverter = ({ channels }) => [channels[0] ?? []];

    const iccProfile: ProductionProfile = {
      id: 'acceptance-icc',
      version: '1',
      processKind: 'screen-printing',
      channels: [toneChannel({ id: 'k', role: 'black' })],
      separation: {
        mode: 'icc',
        identity: transformIdentity({ id: 'acceptance-icc-transform', type: 'icc' }),
        provenance: {
          sourceProfileId: 'source-rgb',
          sourceProfileHash: sha256(source),
          destinationProfileId: 'destination-gray',
          destinationProfileHash: sha256(destination),
          renderingIntent: 'relative-colorimetric',
          blackPointCompensation: true,
        },
        sourceProfileBytes: source,
        destinationProfileBytes: destination,
      },
    };

    const first = completed(
      run({ input: rgbInput(), profile: iccProfile, iccConverter: converter }),
    );
    const separation = first.snapshot.separation;
    expect(separation.mode).toBe('icc');
    if (separation.mode !== 'icc') return;

    expect(separation.sourceProfileBytes).toEqual(source);
    expect(separation.destinationProfileBytes).toEqual(destination);
    expect(verifyEmbeddedProfiles(first.snapshot).ok).toBe(true);
    expect(verifySnapshot(first.snapshot).ok).toBe(true);

    const tampered = {
      ...first.snapshot,
      separation: { ...separation, sourceProfileBytes: Uint8Array.from([9, 9, 9, 9]) },
    };
    const verification = verifyEmbeddedProfiles(tampered);
    expect(verification.ok).toBe(false);
    expect(verification.issues.map((issue) => issue.code)).toEqual([
      'separation.unreproducible_transform',
    ]);

    const rebuilt = completed(
      run({
        input: rgbInput(),
        profile: {
          id: first.snapshot.profile.id,
          version: first.snapshot.profile.version,
          processKind: first.snapshot.process.kind,
          channels: [
            {
              ...toneChannel({ id: 'k', role: 'black' }),
              trc: identityCurve(),
              limits: { a_wf: 0, a_vf: 1 },
            },
          ],
          separation: {
            mode: 'icc',
            identity: identityFromSnapshot(separation.identity),
            provenance: {
              sourceProfileId: separation.provenance.sourceProfileId,
              sourceProfileHash: separation.provenance.sourceProfileHash,
              destinationProfileId: separation.provenance.destinationProfileId,
              destinationProfileHash: separation.provenance.destinationProfileHash,
              renderingIntent: separation.provenance
                .renderingIntent as IccProvenance['renderingIntent'],
              blackPointCompensation: separation.provenance.blackPointCompensation,
            },
            sourceProfileBytes: separation.sourceProfileBytes,
            destinationProfileBytes: separation.destinationProfileBytes,
          },
        },
        iccConverter: converter,
      }),
    );
    expect(rebuilt.snapshot.hash).toBe(first.snapshot.hash);
    expect(rasterDigest(rebuilt)).toBe(rasterDigest(first));
  });
});

describe('spec AC27: versioned canonicalisation and its golden pin', () => {
  it('pins the acceptance fixture canonical bytes and raster bytes', () => {
    const result = completed(run({ input: rampInput(), profile: grayProfile() }));
    const text = snapshotCanonicalText(result.snapshot);

    expect(result.snapshot.canonicalisationVersion).toBe(CANONICALISATION_VERSION);
    expect(CANONICALISATION_VERSION).toBe('1');
    expect(text.startsWith('{"canonicalisationVersion":"1",')).toBe(true);
    expect(result.snapshot.hash).toBe(
      'ba5456ba53ecaad7fd54fef186a1c73f34e23473bb53bb88be824119b38bcef5',
    );
    expect(rasterDigest(result)).toBe(
      'f4f06083a164c0c6a51ca4aba5bf9cc028eede8e02c90211ee7f4876b071d33e',
    );
  });

  it('produces the same bytes and hash regardless of key insertion order', () => {
    const input: ContinuousToneInput = flatInput(128);
    const ordered: FixtureProfile = {
      id: 'acceptance-gray',
      version: '1',
      processKind: 'screen-printing',
      channels: [toneChannel()],
      separation: graySeparation(),
    };
    const reordered: FixtureProfile = {
      separation: graySeparation(),
      channels: [toneChannel()],
      processKind: 'screen-printing',
      version: '1',
      id: 'acceptance-gray',
    };

    const first = completed(run({ input, profile: ordered }));
    const second = completed(run({ input, profile: reordered }));

    expect(snapshotCanonicalText(second.snapshot)).toBe(snapshotCanonicalText(first.snapshot));
    expect(second.snapshot.hash).toBe(first.snapshot.hash);
    expect(rasterDigest(second)).toBe(rasterDigest(first));
  });

  it('never leaks a diagnostic into the canonical bytes', () => {
    const warned = completed(
      run({
        input: flatInput(128),
        profile: grayProfile({ minimumInputSamplesPerScreenLine: 8 }),
      }),
    );
    expect(codes(warned)).toEqual(['input.low_resolution']);
    expect(snapshotCanonicalText(warned.snapshot)).not.toContain('input.low_resolution');
    expect(snapshotCanonicalText(warned.snapshot)).not.toContain('warning');
  });
});
