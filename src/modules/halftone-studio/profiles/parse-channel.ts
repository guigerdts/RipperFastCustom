/**
 * Structural parsing for a profile's channel list.
 *
 * The reader checks shape only: an id and an ink name string, a screening object
 * with numeric LPI/angle and a dot-shape string. Whether the ink is unique, the
 * LPI positive or the dot shape one the engine knows is a value question, and
 * `channel-validation.ts` answers it. `dataKind` and `dotShape` are narrowed to
 * their unions here and either rejected or accepted by that later check, so a
 * wrong enum is reported once, with the right code.
 */

import type { ChannelScreening, ProfileChannel, ProfileDataKind } from './model';
import { createProfileIssue } from './diagnostics';
import type { ProfileIssue } from './diagnostics';
import { expectNullableString, expectNumber, expectString, isRecord } from './parse-readers';

export function readChannels(value: unknown, issues: ProfileIssue[]): ProfileChannel[] | null {
  if (!Array.isArray(value)) {
    issues.push(
      createProfileIssue('profile.missing_field', 'The profile needs a channels list.', 'channels'),
    );
    return null;
  }

  const channels: ProfileChannel[] = [];
  value.forEach((entry, index) => {
    const path = `channels[${index}]`;
    if (!isRecord(entry)) {
      issues.push(
        createProfileIssue('profile.invalid_field', 'Each channel must be an object.', path),
      );
      return;
    }

    const id = expectString(entry['id'], `${path}.id`, issues);
    const inkName = expectString(entry['inkName'], `${path}.inkName`, issues);
    const displayColor = expectNullableString(
      entry['displayColor'],
      `${path}.displayColor`,
      issues,
    );
    const screening = readScreening(entry['screening'], `${path}.screening`, issues);

    const dataKind = entry['dataKind'];
    if (typeof dataKind !== 'string') {
      issues.push(
        createProfileIssue(
          'profile.missing_field',
          'Each channel needs a dataKind string.',
          `${path}.dataKind`,
        ),
      );
    }

    if (
      id === null ||
      inkName === null ||
      displayColor === undefined ||
      screening === null ||
      typeof dataKind !== 'string'
    ) {
      return;
    }

    channels.push({
      id,
      inkName,
      dataKind: dataKind as ProfileDataKind,
      displayColor,
      screening,
    });
  });

  return channels;
}

export function readScreening(
  value: unknown,
  path: string,
  issues: ProfileIssue[],
): ChannelScreening | null {
  if (!isRecord(value)) {
    issues.push(createProfileIssue('profile.missing_field', 'Each channel needs screening.', path));
    return null;
  }

  const lpi = expectNumber(value['lpi'], `${path}.lpi`, issues);
  const angle = expectNumber(value['angle'], `${path}.angle`, issues);
  const dotShape = value['dotShape'];

  if (typeof dotShape !== 'string') {
    issues.push(
      createProfileIssue(
        'profile.missing_field',
        'Each channel needs a dotShape string.',
        `${path}.dotShape`,
      ),
    );
  }

  if (lpi === null || angle === null || typeof dotShape !== 'string') return null;
  return { lpi, angle, dotShape: dotShape as ChannelScreening['dotShape'] };
}
