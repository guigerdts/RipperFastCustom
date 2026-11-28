import { describe, expect, it } from 'vitest';
import { channel, validProfile } from '../../../helpers/profileFixtures';
import { sampleInput } from '../../../helpers/inputFixtures';
import {
  adaptProfileToRequest,
  toEngineProfile,
  toScreeningRequest,
} from '../../../../src/modules/halftone-studio/profiles/engine-adapter';
import { hashCanonical } from '../../../../src/engines/halftone/canonical';
import type { ChannelPreservingSeparation } from '../../../../src/engines/halftone/contracts';

describe('engine adapter', () => {
  it('maps ink channels to engine channels with LPI as frequency', () => {
    const profile = toEngineProfile(validProfile());
    expect(profile.channels).toHaveLength(4);
    expect(profile.channels[0]).toMatchObject({
      id: 'c',
      role: 'cyan',
      dataKind: 'tone',
      screening: { method: 'am', frequency: 55, angle: 15, dotShape: 'round' },
    });
  });

  it('omits absent optional constraints instead of sending null', () => {
    const profile = toEngineProfile(
      validProfile({
        output: { dpi: 1200, allowedResolutions: null },
        constraints: { minimumCellPixels: null, minimumInputSamplesPerScreenLine: null },
      }),
    );
    expect(profile.allowedOutputResolutions).toBeUndefined();
    expect(profile.minimumCellPixels).toBeUndefined();
    expect(profile.minimumInputSamplesPerScreenLine).toBeUndefined();
  });

  it('forwards declared constraints', () => {
    const profile = toEngineProfile(validProfile());
    expect(profile.allowedOutputResolutions).toEqual([1200, 2400]);
    expect(profile.minimumCellPixels).toBe(4);
    expect(profile.minimumInputSamplesPerScreenLine).toBe(2);
  });

  it('computes the separation identity from the effective mapping', () => {
    const profile = toEngineProfile(validProfile());
    const separation = profile.separation as ChannelPreservingSeparation;
    expect(separation.identity.parameterHash).toBe(
      hashCanonical({
        mode: 'channel-preserving',
        channelMap: { c: 'c', m: 'm', y: 'y', k: 'k' },
      }),
    );
    expect(separation.identity.hashAlgorithm).toBe('sha256');
    expect(separation.identity.canonicalisationVersion).toBe('1');
    expect(separation.identity.parameterHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces a different identity when the mapping changes', () => {
    const a = toEngineProfile(validProfile());
    const b = toEngineProfile(
      validProfile({ separation: { mode: 'channel-preserving', channelMap: { gray: 'k' } } }),
    );
    const hashA = (a.separation as ChannelPreservingSeparation).identity.parameterHash;
    const hashB = (b.separation as ChannelPreservingSeparation).identity.parameterHash;
    expect(hashA).not.toBe(hashB);
  });

  it('builds a screening request with the production DPI', () => {
    const input = sampleInput();
    const request = toScreeningRequest(validProfile(), input);
    expect(request.input).toBe(input);
    expect(request.output.dpi).toBe(1200);
    expect(request.preview).toBeUndefined();
  });

  it('reports a usable profile as ready', () => {
    const result = adaptProfileToRequest(validProfile(), sampleInput());
    expect(result.ready).toBe(true);
    expect(result.request).not.toBeNull();
    expect(result.diagnostics.some((entry) => entry.issue.severity === 'error')).toBe(false);
  });

  it('refuses to adapt a profile with blocking errors', () => {
    const result = adaptProfileToRequest(
      validProfile({
        channels: [
          channel({ id: 'dup', inkName: 'black' }),
          channel({ id: 'dup', inkName: 'black' }),
        ],
      }),
      sampleInput(),
    );
    expect(result.ready).toBe(false);
    expect(result.request).toBeNull();
    expect(result.diagnostics.every((entry) => entry.stage === 'profile')).toBe(true);
  });

  it('surfaces engine diagnostics without throwing', () => {
    const result = adaptProfileToRequest(
      validProfile({
        channels: [
          channel({
            id: 'a',
            inkName: 'black',
            screening: { lpi: 55, angle: 45, dotShape: 'round' },
          }),
          channel({
            id: 'b',
            inkName: 'spot',
            screening: { lpi: 55, angle: 45, dotShape: 'round' },
          }),
        ],
        separation: { mode: 'channel-preserving', channelMap: { a: 'a', b: 'b' } },
      }),
      sampleInput(),
    );
    expect(result.ready).toBe(true);
    const engineIssues = result.diagnostics.filter((entry) => entry.stage === 'engine');
    expect(engineIssues.map((entry) => entry.issue.code)).toContain('geometry.duplicate_angle');
  });
});
