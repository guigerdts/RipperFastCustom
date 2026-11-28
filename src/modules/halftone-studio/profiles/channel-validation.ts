/**
 * Channel and screen-addressability validation.
 *
 * A channel is an ink with its own screen. This module checks that the ink is
 * identifiable and unique, that its screening values are usable and that the
 * declared output resolution can actually carry the screen at the requested
 * frequency. DPI and LPI are checked in their own units; the ratio between them
 * is a third, separate check, because a valid DPI and a valid LPI can still be
 * incompatible with each other.
 */

import { DOT_SHAPES } from '../../../engines/halftone/contracts';
import { cellPixels } from './model';
import type { ProductionProfileDocument } from './model';
import { createProfileIssue } from './diagnostics';
import type { ProfileIssue } from './diagnostics';
import { isFiniteNumber, isNonEmptyString, isPositive } from './primitives';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export interface ChannelValidation {
  readonly issues: ProfileIssue[];
  /** Channels with a usable LPI, keyed by id, for the cell-relation check. */
  readonly screening: ReadonlyMap<string, number>;
}

/** Validates every channel and returns the usable LPI per channel id. */
export function validateChannels(document: ProductionProfileDocument): ChannelValidation {
  const issues: ProfileIssue[] = [];
  const screening = new Map<string, number>();
  const channels = document.channels;

  if (!Array.isArray(channels) || channels.length === 0) {
    issues.push(
      createProfileIssue(
        'profile.no_channels',
        'A profile must declare at least one ink channel.',
        'channels',
      ),
    );
    return { issues, screening };
  }

  const seenIds = new Set<string>();
  const seenInk = new Set<string>();

  channels.forEach((channel, index) => {
    const path = `channels[${index}]`;
    const id = channel.id;
    if (isNonEmptyString(id)) {
      if (seenIds.has(id)) {
        issues.push(
          createProfileIssue(
            'profile.duplicate_channel_id',
            `Two channels share the id "${id}".`,
            `${path}.id`,
          ),
        );
      }
      seenIds.add(id);
    }

    if (isNonEmptyString(channel.inkName)) {
      const ink = channel.inkName.trim().toLowerCase();
      if (seenInk.has(ink)) {
        issues.push(
          createProfileIssue(
            'profile.duplicate_ink_name',
            `Two channels declare the ink "${channel.inkName}".`,
            `${path}.inkName`,
          ),
        );
      }
      seenInk.add(ink);
    }

    if (channel.dataKind !== 'tone' && channel.dataKind !== 'mask') {
      issues.push(
        createProfileIssue(
          'channel.data_kind_invalid',
          'Channel dataKind must be "tone" or "mask".',
          `${path}.dataKind`,
          { value: String(channel.dataKind) },
        ),
      );
    }

    if (channel.displayColor !== null && !HEX_COLOR.test(String(channel.displayColor))) {
      issues.push(
        createProfileIssue(
          'channel.display_color_invalid',
          'displayColor must be null or a "#rrggbb" hex colour.',
          `${path}.displayColor`,
          { value: String(channel.displayColor) },
        ),
      );
    }

    const lpi = channel.screening?.lpi;
    if (!isPositive(lpi)) {
      issues.push(
        createProfileIssue(
          'channel.lpi_invalid',
          'Channel screen frequency (LPI) must be a finite number greater than zero.',
          `${path}.screening.lpi`,
          { value: String(lpi) },
        ),
      );
    } else if (isNonEmptyString(id)) {
      screening.set(id, lpi);
    }

    const angle = channel.screening?.angle;
    if (!isFiniteNumber(angle)) {
      issues.push(
        createProfileIssue(
          'channel.angle_invalid',
          'Channel screen angle must be a finite number of degrees.',
          `${path}.screening.angle`,
          { value: String(angle) },
        ),
      );
    }

    const dotShape = channel.screening?.dotShape;
    if (typeof dotShape !== 'string' || !(DOT_SHAPES as readonly string[]).includes(dotShape)) {
      issues.push(
        createProfileIssue(
          'channel.dot_shape_unknown',
          `Channel dot shape must be one of: ${DOT_SHAPES.join(', ')}.`,
          `${path}.screening.dotShape`,
          { value: String(dotShape) },
        ),
      );
    }
  });

  return { issues, screening };
}

/**
 * Checks that the output resolution can carry each usable screen. Below one
 * pixel per cell the screen is not representable at all (error); below a
 * declared minimum it is representable but coarser than the profile allows
 * (warning, matching the engine's `geometry.insufficient_addressability`).
 */
export function validateCellRelation(
  document: ProductionProfileDocument,
  screening: ReadonlyMap<string, number>,
): ProfileIssue[] {
  const issues: ProfileIssue[] = [];
  const dpi = document.output?.dpi;
  if (!isPositive(dpi)) return issues;

  const minimum = document.constraints?.minimumCellPixels;

  for (const [id, lpi] of screening) {
    const pixels = cellPixels(dpi, lpi);
    if (pixels < 1) {
      issues.push(
        createProfileIssue(
          'profile.cell_too_small',
          'The screen cannot be represented: the output has fewer than one pixel per cell.',
          'output.dpi',
          { channel: id, dpi, lpi, cellPixels: pixels },
        ),
      );
    } else if (isPositive(minimum) && pixels < minimum) {
      issues.push(
        createProfileIssue(
          'profile.minimum_cell_not_met',
          'The output has fewer pixels per cell than the profile declares as its minimum.',
          'constraints.minimumCellPixels',
          { channel: id, dpi, lpi, cellPixels: pixels, minimumCellPixels: minimum },
        ),
      );
    }
  }

  return issues;
}
