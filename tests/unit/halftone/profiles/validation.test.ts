import { describe, expect, it } from 'vitest';
import { channel, mixingProfile, validProfile } from '../../../helpers/profileFixtures';
import {
  isUsableProfile,
  validateProfileDocument,
} from '../../../../src/modules/halftone-studio/profiles/validation';
import { hasProfileErrors } from '../../../../src/modules/halftone-studio/profiles/diagnostics';
import type { ProfileIssue } from '../../../../src/modules/halftone-studio/profiles/diagnostics';

function codes(issues: readonly ProfileIssue[]): string[] {
  return issues.map((issue) => issue.code);
}

describe('validateProfileDocument', () => {
  it('accepts a well-formed CMYK profile', () => {
    expect(validateProfileDocument(validProfile())).toEqual([]);
    expect(isUsableProfile(validProfile())).toBe(true);
  });

  it('accepts a linear-mixing profile with one row per tone channel', () => {
    expect(hasProfileErrors(validateProfileDocument(mixingProfile()))).toBe(false);
  });

  it('wires channel and separation validation into the document check', () => {
    expect(codes(validateProfileDocument(validProfile({ channels: [] })))).toContain(
      'profile.no_channels',
    );
    expect(
      codes(
        validateProfileDocument(
          validProfile({ separation: { mode: 'channel-preserving', channelMap: {} } }),
        ),
      ),
    ).toContain('separation.channel_map_empty');
  });

  it('rejects an unsafe profile id', () => {
    expect(codes(validateProfileDocument(validProfile({ id: '../escape' })))).toContain(
      'profile.id_invalid',
    );
  });

  it('rejects a missing id', () => {
    expect(codes(validateProfileDocument(validProfile({ id: '' })))).toContain(
      'profile.id_missing',
    );
  });

  it('rejects empty identity and metadata', () => {
    const issues = validateProfileDocument(
      validProfile({
        version: ' ',
        processKind: '',
        metadata: {
          name: '',
          description: null,
          createdAt: 'not-a-date',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      }),
    );
    expect(codes(issues)).toEqual(
      expect.arrayContaining([
        'profile.version_missing',
        'profile.process_kind_missing',
        'profile.name_missing',
        'profile.metadata_timestamp_invalid',
      ]),
    );
  });

  it('rejects an unusable output DPI', () => {
    const issues = validateProfileDocument(
      validProfile({ output: { dpi: 0, allowedResolutions: null } }),
    );
    expect(hasProfileErrors(issues)).toBe(true);
    expect(codes(issues)).toContain('profile.output_dpi_invalid');
  });

  it('rejects an output DPI the profile does not allow', () => {
    const issues = validateProfileDocument(
      validProfile({ output: { dpi: 1200, allowedResolutions: [2400] } }),
    );
    expect(codes(issues)).toContain('profile.dpi_not_allowed');
  });

  it('rejects an empty allowed-resolution list', () => {
    const issues = validateProfileDocument(
      validProfile({ output: { dpi: 1200, allowedResolutions: [] } }),
    );
    expect(codes(issues)).toContain('profile.allowed_resolutions_invalid');
  });

  it('rejects an unusable declared constraint', () => {
    const issues = validateProfileDocument(
      validProfile({
        constraints: { minimumCellPixels: 0, minimumInputSamplesPerScreenLine: null },
      }),
    );
    expect(codes(issues)).toContain('profile.constraint_invalid');
  });

  it('reports an unmet declared minimum cell as a warning, not an error', () => {
    const issues = validateProfileDocument(
      validProfile({
        constraints: { minimumCellPixels: 100, minimumInputSamplesPerScreenLine: null },
        channels: [channel({ id: 'k', inkName: 'black' })],
        separation: { mode: 'channel-preserving', channelMap: { gray: 'k' } },
      }),
    );
    const warning = issues.find((issue) => issue.code === 'profile.minimum_cell_not_met');
    expect(warning?.severity).toBe('warning');
    expect(hasProfileErrors(issues)).toBe(false);
  });
});
