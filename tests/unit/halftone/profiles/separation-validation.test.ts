import { describe, expect, it } from 'vitest';
import { channel, mixingProfile, validProfile } from '../../../helpers/profileFixtures';
import { validateSeparationDocument } from '../../../../src/modules/halftone-studio/profiles/separation-validation';
import type { ProfileIssue } from '../../../../src/modules/halftone-studio/profiles/diagnostics';

function codes(issues: readonly ProfileIssue[]): string[] {
  return issues.map((issue) => issue.code);
}

describe('validateSeparationDocument', () => {
  it('accepts a complete channel-preserving mapping', () => {
    expect(validateSeparationDocument(validProfile().separation, validProfile())).toEqual([]);
  });

  it('rejects an empty channel map', () => {
    expect(
      codes(
        validateSeparationDocument({ mode: 'channel-preserving', channelMap: {} }, validProfile()),
      ),
    ).toContain('separation.channel_map_empty');
  });

  it('rejects a mapping to an undeclared channel', () => {
    expect(
      codes(
        validateSeparationDocument(
          { mode: 'channel-preserving', channelMap: { gray: 'nope' } },
          validProfile(),
        ),
      ),
    ).toContain('separation.channel_map_unknown');
  });

  it('rejects a mapping to a mask channel', () => {
    const document = validProfile({
      channels: [channel({ id: 'w', inkName: 'white', dataKind: 'mask' })],
    });
    expect(
      codes(
        validateSeparationDocument(
          { mode: 'channel-preserving', channelMap: { gray: 'w' } },
          document,
        ),
      ),
    ).toContain('separation.channel_map_mask');
  });

  it('accepts a linear-mixing matrix with one row per tone channel', () => {
    expect(validateSeparationDocument(mixingProfile().separation, mixingProfile())).toEqual([]);
  });

  it('rejects an empty matrix', () => {
    expect(
      codes(validateSeparationDocument({ mode: 'linear-mixing', matrix: [] }, validProfile())),
    ).toContain('separation.matrix_empty');
  });

  it('rejects a matrix with the wrong row count', () => {
    const issues = validateSeparationDocument(
      { mode: 'linear-mixing', matrix: [[1, 0]] },
      validProfile(),
    );
    expect(codes(issues)).toContain('separation.matrix_row_count');
  });

  it('rejects rows with an inconsistent shape', () => {
    const issues = validateSeparationDocument(
      {
        mode: 'linear-mixing',
        matrix: [
          [1, 0, 0],
          [0, 1],
          [0, 0, 1],
          [0, 0, 0],
        ],
      },
      validProfile(),
    );
    expect(codes(issues)).toContain('separation.matrix_shape');
  });

  it('rejects a non-finite coefficient', () => {
    const issues = validateSeparationDocument(
      {
        mode: 'linear-mixing',
        matrix: [
          [1, 0, 0],
          [0, Number.NaN, 0],
          [0, 0, 1],
          [0, 0, 0],
        ],
      },
      validProfile(),
    );
    expect(codes(issues)).toContain('separation.matrix_value_invalid');
  });

  it('rejects a matrix with zero columns', () => {
    const issues = validateSeparationDocument(
      { mode: 'linear-mixing', matrix: [[], [], [], []] },
      validProfile(),
    );
    expect(codes(issues)).toContain('separation.matrix_shape');
  });

  it('reports an unsupported separation mode without throwing', () => {
    expect(codes(validateSeparationDocument({ mode: 'icc' } as never, validProfile()))).toContain(
      'separation.mode_unsupported',
    );
  });

  it('reports a missing separation without throwing', () => {
    expect(codes(validateSeparationDocument(null as never, validProfile()))).toContain(
      'profile.missing_field',
    );
  });
});
