import { describe, expect, it } from 'vitest';
import { channel, validProfile } from '../../../helpers/profileFixtures';
import {
  validateCellRelation,
  validateChannels,
} from '../../../../src/modules/halftone-studio/profiles/channel-validation';
import type { ProfileIssue } from '../../../../src/modules/halftone-studio/profiles/diagnostics';

function codes(issues: readonly ProfileIssue[]): string[] {
  return issues.map((issue) => issue.code);
}

describe('validateChannels', () => {
  it('accepts distinct inks with usable screens', () => {
    const result = validateChannels(validProfile());
    expect(result.issues).toEqual([]);
    expect([...result.screening.keys()]).toEqual(['c', 'm', 'y', 'k']);
    expect(result.screening.get('k')).toBe(55);
  });

  it('requires at least one channel', () => {
    const result = validateChannels(validProfile({ channels: [] }));
    expect(codes(result.issues)).toContain('profile.no_channels');
    expect(result.screening.size).toBe(0);
  });

  it('reports duplicate ids and duplicate ink names case-insensitively', () => {
    const result = validateChannels(
      validProfile({
        channels: [
          channel({ id: 'dup', inkName: 'Black' }),
          channel({ id: 'dup', inkName: 'black' }),
        ],
      }),
    );
    expect(codes(result.issues)).toEqual(
      expect.arrayContaining(['profile.duplicate_channel_id', 'profile.duplicate_ink_name']),
    );
  });

  it('reports an unknown data kind and a malformed display colour', () => {
    const result = validateChannels(
      validProfile({
        channels: [
          channel({
            id: 'k',
            inkName: 'black',
            dataKind: 'bogus' as never,
            displayColor: 'red',
          }),
        ],
      }),
    );
    expect(codes(result.issues)).toEqual(
      expect.arrayContaining(['channel.data_kind_invalid', 'channel.display_color_invalid']),
    );
  });

  it('accepts a null display colour and a hex one', () => {
    const result = validateChannels(
      validProfile({
        channels: [
          channel({ id: 'a', inkName: 'a', displayColor: null }),
          channel({ id: 'b', inkName: 'b', displayColor: '#ff8800' }),
        ],
      }),
    );
    expect(result.issues).toEqual([]);
  });

  it('reports a non-positive LPI and a non-finite angle', () => {
    const result = validateChannels(
      validProfile({
        channels: [
          channel({
            id: 'k',
            inkName: 'black',
            screening: { lpi: 0, angle: Number.NaN, dotShape: 'round' },
          }),
        ],
      }),
    );
    expect(codes(result.issues)).toEqual(
      expect.arrayContaining(['channel.lpi_invalid', 'channel.angle_invalid']),
    );
    expect(result.screening.size).toBe(0);
  });

  it('reports an unknown dot shape', () => {
    const result = validateChannels(
      validProfile({
        channels: [
          channel({
            id: 'k',
            inkName: 'black',
            screening: { lpi: 55, angle: 45, dotShape: 'bogus' as never },
          }),
        ],
      }),
    );
    expect(codes(result.issues)).toContain('channel.dot_shape_unknown');
  });
});

describe('validateCellRelation', () => {
  it('flags a screen the output cannot represent', () => {
    const issues = validateCellRelation(
      validProfile({
        output: { dpi: 100, allowedResolutions: null },
        constraints: { minimumCellPixels: null, minimumInputSamplesPerScreenLine: null },
      }),
      new Map([['k', 200]]),
    );
    expect(codes(issues)).toContain('profile.cell_too_small');
  });

  it('warns when the cell is above one pixel but below the declared minimum', () => {
    const issues = validateCellRelation(
      validProfile({
        output: { dpi: 1200, allowedResolutions: null },
        constraints: { minimumCellPixels: 100, minimumInputSamplesPerScreenLine: null },
      }),
      new Map([['k', 55]]),
    );
    const warning = issues.find((issue) => issue.code === 'profile.minimum_cell_not_met');
    expect(warning?.severity).toBe('warning');
  });

  it('is silent when the resolution carries the screen comfortably', () => {
    const issues = validateCellRelation(validProfile(), new Map([['k', 55]]));
    expect(issues).toEqual([]);
  });

  it('skips the check when the output DPI itself is unusable', () => {
    const issues = validateCellRelation(
      validProfile({ output: { dpi: 0, allowedResolutions: null } }),
      new Map([['k', 55]]),
    );
    expect(issues).toEqual([]);
  });
});
