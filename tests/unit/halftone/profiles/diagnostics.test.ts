import { describe, expect, it } from 'vitest';
import {
  PROFILE_ISSUE_REGISTRY,
  createProfileIssue,
  hasProfileErrors,
} from '../../../../src/modules/halftone-studio/profiles/diagnostics';
import type { ProfileIssueCode } from '../../../../src/modules/halftone-studio/profiles/diagnostics';

describe('profile diagnostics', () => {
  it('takes severity from the registry, never from the caller', () => {
    const issue = createProfileIssue(
      'profile.minimum_cell_not_met',
      'The output has fewer pixels per cell than declared.',
      'constraints.minimumCellPixels',
    );
    expect(issue.severity).toBe('warning');
    expect(issue.code).toBe('profile.minimum_cell_not_met');
  });

  it('keeps structured details and the document path', () => {
    const issue = createProfileIssue(
      'profile.cell_too_small',
      'The screen cannot be represented.',
      'output.dpi',
      { channel: 'k', dpi: 100, lpi: 200, cellPixels: 0.5 },
    );
    expect(issue.path).toBe('output.dpi');
    expect(issue.details).toEqual({ channel: 'k', dpi: 100, lpi: 200, cellPixels: 0.5 });
  });

  it('omits details when none are given', () => {
    expect('details' in createProfileIssue('profile.id_missing', 'No identity.', 'id')).toBe(false);
  });

  it('treats every registered code as a known code', () => {
    const codes = Object.keys(PROFILE_ISSUE_REGISTRY) as ProfileIssueCode[];
    expect(codes.length).toBeGreaterThan(20);
    for (const code of codes) {
      expect(createProfileIssue(code, 'm', 'p').code).toBe(code);
    }
  });

  it('reports errors only when a blocking issue is present', () => {
    const warning = createProfileIssue('profile.minimum_cell_not_met', 'm', 'p');
    const error = createProfileIssue('profile.id_missing', 'm', 'id');

    expect(hasProfileErrors([])).toBe(false);
    expect(hasProfileErrors([warning])).toBe(false);
    expect(hasProfileErrors([warning, error])).toBe(true);
  });
});
