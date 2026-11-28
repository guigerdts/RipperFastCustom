/**
 * Structural parsing for a profile's separation declaration.
 *
 * Two supported modes in schema v1. Anything else — including `icc`, which the
 * contract declares unsupported because it needs captured profile bytes — is
 * refused with `separation.mode_unsupported` instead of being dropped. Whether
 * the map or matrix is *consistent with the declared channels* is checked by
 * `separation-validation.ts`.
 */

import type { ProfileSeparation } from './model';
import { createProfileIssue } from './diagnostics';
import type { ProfileIssue } from './diagnostics';
import { isRecord } from './parse-readers';

export function readSeparation(value: unknown, issues: ProfileIssue[]): ProfileSeparation | null {
  if (!isRecord(value)) {
    issues.push(
      createProfileIssue('profile.missing_field', 'The profile needs a separation.', 'separation'),
    );
    return null;
  }

  if (value['mode'] === 'channel-preserving') {
    const mapRaw = value['channelMap'];
    if (!isRecord(mapRaw)) {
      issues.push(
        createProfileIssue(
          'profile.missing_field',
          'A channel-preserving separation needs a channelMap object.',
          'separation.channelMap',
        ),
      );
      return null;
    }
    const channelMap: Record<string, string> = {};
    for (const [source, target] of Object.entries(mapRaw)) {
      if (typeof target !== 'string') {
        issues.push(
          createProfileIssue(
            'profile.invalid_field',
            'Every channelMap value must be a channel id string.',
            `separation.channelMap.${source}`,
          ),
        );
        return null;
      }
      channelMap[source] = target;
    }
    return { mode: 'channel-preserving', channelMap };
  }

  if (value['mode'] === 'linear-mixing') {
    const matrixRaw = value['matrix'];
    if (!Array.isArray(matrixRaw)) {
      issues.push(
        createProfileIssue(
          'profile.missing_field',
          'A linear-mixing separation needs a matrix array.',
          'separation.matrix',
        ),
      );
      return null;
    }
    const matrix: number[][] = [];
    for (const row of matrixRaw) {
      if (!Array.isArray(row) || row.some((entry) => typeof entry !== 'number')) {
        issues.push(
          createProfileIssue(
            'profile.invalid_field',
            'Every matrix row must be a list of numbers.',
            'separation.matrix',
          ),
        );
        return null;
      }
      matrix.push(row as number[]);
    }
    return { mode: 'linear-mixing', matrix };
  }

  issues.push(
    createProfileIssue(
      'separation.mode_unsupported',
      'This profile schema supports only channel-preserving and linear-mixing separations.',
      'separation.mode',
      { value: String(value['mode']) },
    ),
  );
  return null;
}
