/**
 * Stable serialization for production profiles.
 *
 * Writes a fixed key order so the same document always produces the same bytes.
 * That keeps stored files diff-friendly, makes import/export reproducible, and
 * gives the tests a stable target. Unknown properties are dropped rather than
 * carried along silently; parsing (see `parse.ts`) rebuilds only the known shape.
 */

import type { ProductionProfileDocument } from './model';

/**
 * Serializes a document with a fixed key order and two-space indentation. The
 * output round-trips through `parseProfileDocument` without loss.
 */
export function serializeProfileDocument(document: ProductionProfileDocument): string {
  const ordered = {
    schemaVersion: document.schemaVersion,
    id: document.id,
    version: document.version,
    processKind: document.processKind,
    metadata: {
      name: document.metadata.name,
      description: document.metadata.description,
      createdAt: document.metadata.createdAt,
      updatedAt: document.metadata.updatedAt,
    },
    output: {
      dpi: document.output.dpi,
      allowedResolutions: document.output.allowedResolutions,
    },
    constraints: {
      minimumCellPixels: document.constraints.minimumCellPixels,
      minimumInputSamplesPerScreenLine: document.constraints.minimumInputSamplesPerScreenLine,
    },
    separation:
      document.separation.mode === 'channel-preserving'
        ? { mode: 'channel-preserving', channelMap: { ...document.separation.channelMap } }
        : {
            mode: 'linear-mixing',
            matrix: document.separation.matrix.map((row) => [...row]),
          },
    channels: document.channels.map((channel) => ({
      id: channel.id,
      inkName: channel.inkName,
      dataKind: channel.dataKind,
      displayColor: channel.displayColor,
      screening: {
        lpi: channel.screening.lpi,
        angle: channel.screening.angle,
        dotShape: channel.screening.dotShape,
      },
    })),
  };

  return JSON.stringify(ordered, null, 2);
}
