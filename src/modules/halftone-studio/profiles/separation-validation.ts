/**
 * Separation validation against the declared channels.
 *
 * A separation is the declared conversion from source components to ink
 * channels. It must be complete and consistent on its own terms: every target it
 * names must be a declared tone channel, and a linear-mixing matrix must have one
 * row per tone channel with a consistent, finite shape. These checks are pure and
 * host-independent; the engine re-validates the same declaration once it is
 * adapted.
 */

import { toneChannels } from './model';
import type { ProfileChannel, ProfileSeparation, ProductionProfileDocument } from './model';
import { createProfileIssue } from './diagnostics';
import type { ProfileIssue } from './diagnostics';
import { isFiniteNumber, isNonEmptyString } from './primitives';

/** Validates a separation declaration against the profile that owns it. */
export function validateSeparationDocument(
  separation: ProfileSeparation,
  document: ProductionProfileDocument,
): ProfileIssue[] {
  if (separation === null || typeof separation !== 'object') {
    return [
      createProfileIssue('profile.missing_field', 'The profile needs a separation.', 'separation'),
    ];
  }

  if (separation.mode === 'channel-preserving') {
    return validateChannelPreserving(separation.channelMap, document);
  }
  if (separation.mode === 'linear-mixing') {
    return validateLinearMixing(separation.matrix, document);
  }

  return [
    createProfileIssue(
      'separation.mode_unsupported',
      'This profile schema supports only channel-preserving and linear-mixing separations.',
      'separation.mode',
      { value: String((separation as { mode?: unknown }).mode) },
    ),
  ];
}

function declaredChannels(document: ProductionProfileDocument): Map<string, ProfileChannel> {
  const map = new Map<string, ProfileChannel>();
  for (const channel of document.channels ?? []) {
    if (isNonEmptyString(channel.id)) map.set(channel.id, channel);
  }
  return map;
}

function validateChannelPreserving(
  channelMap: Readonly<Record<string, string>>,
  document: ProductionProfileDocument,
): ProfileIssue[] {
  const issues: ProfileIssue[] = [];
  const entries = Object.entries(channelMap ?? {});
  if (entries.length === 0) {
    return [
      createProfileIssue(
        'separation.channel_map_empty',
        'A channel-preserving separation must map at least one source component.',
        'separation.channelMap',
      ),
    ];
  }

  const channels = declaredChannels(document);
  for (const [source, channelId] of entries) {
    const target = channels.get(channelId);
    if (target === undefined) {
      issues.push(
        createProfileIssue(
          'separation.channel_map_unknown',
          `The separation maps "${source}" to the undeclared channel "${channelId}".`,
          `separation.channelMap.${source}`,
          { source, value: channelId },
        ),
      );
    } else if (target.dataKind !== 'tone') {
      issues.push(
        createProfileIssue(
          'separation.channel_map_mask',
          `The separation maps "${source}" to the mask channel "${channelId}".`,
          `separation.channelMap.${source}`,
          { source, value: channelId },
        ),
      );
    }
  }

  return issues;
}

function validateLinearMixing(
  matrix: readonly (readonly number[])[],
  document: ProductionProfileDocument,
): ProfileIssue[] {
  const issues: ProfileIssue[] = [];
  if (!Array.isArray(matrix) || matrix.length === 0) {
    return [
      createProfileIssue(
        'separation.matrix_empty',
        'A linear-mixing separation needs at least one coefficient row.',
        'separation.matrix',
      ),
    ];
  }

  const expectedRows = toneChannels(document).length;
  if (matrix.length !== expectedRows) {
    issues.push(
      createProfileIssue(
        'separation.matrix_row_count',
        'A linear-mixing separation needs one row per tone channel.',
        'separation.matrix',
        { expected: expectedRows, received: matrix.length },
      ),
    );
  }

  const columnCount = Array.isArray(matrix[0]) ? matrix[0].length : 0;
  if (columnCount === 0) {
    issues.push(
      createProfileIssue(
        'separation.matrix_shape',
        'Linear-mixing rows must have at least one coefficient.',
        'separation.matrix[0]',
      ),
    );
  }

  matrix.forEach((row, rowIndex) => {
    if (!Array.isArray(row) || row.length !== columnCount) {
      issues.push(
        createProfileIssue(
          'separation.matrix_shape',
          'Every linear-mixing row must have the same number of coefficients.',
          `separation.matrix[${rowIndex}]`,
          { expected: columnCount, received: Array.isArray(row) ? row.length : 0 },
        ),
      );
      return;
    }
    row.forEach((value, columnIndex) => {
      if (!isFiniteNumber(value)) {
        issues.push(
          createProfileIssue(
            'separation.matrix_value_invalid',
            'Linear-mixing coefficients must be finite numbers.',
            `separation.matrix[${rowIndex}][${columnIndex}]`,
            { value: String(value) },
          ),
        );
      }
    });
  });

  return issues;
}
