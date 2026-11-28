import type {
  ProfileChannel,
  ProductionProfileDocument,
} from '../../src/modules/halftone-studio/profiles/model';
import { PROFILE_SCHEMA_VERSION } from '../../src/modules/halftone-studio/profiles/model';

export function channel(overrides: Partial<ProfileChannel> = {}): ProfileChannel {
  return {
    id: 'k',
    inkName: 'black',
    dataKind: 'tone',
    displayColor: null,
    screening: { lpi: 55, angle: 45, dotShape: 'round' },
    ...overrides,
  };
}

const CMYK_CHANNELS: readonly ProfileChannel[] = [
  channel({ id: 'c', inkName: 'cyan', screening: { lpi: 55, angle: 15, dotShape: 'round' } }),
  channel({ id: 'm', inkName: 'magenta', screening: { lpi: 55, angle: 75, dotShape: 'round' } }),
  channel({ id: 'y', inkName: 'yellow', screening: { lpi: 55, angle: 0, dotShape: 'round' } }),
  channel({ id: 'k', inkName: 'black', screening: { lpi: 55, angle: 45, dotShape: 'round' } }),
];

/** A four-ink screen-print profile with conventional screen angles. */
export function validProfile(
  overrides: Partial<ProductionProfileDocument> = {},
): ProductionProfileDocument {
  const base: ProductionProfileDocument = {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    id: 'screen-print-cmyk',
    version: '1',
    processKind: 'screen-printing',
    metadata: {
      name: 'CMYK 55 LPI',
      description: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    output: { dpi: 1200, allowedResolutions: [1200, 2400] },
    constraints: { minimumCellPixels: 4, minimumInputSamplesPerScreenLine: 2 },
    separation: {
      mode: 'channel-preserving',
      channelMap: { c: 'c', m: 'm', y: 'y', k: 'k' },
    },
    channels: CMYK_CHANNELS,
  };
  return { ...base, ...overrides };
}

/** A two-ink profile with a linear-mixing separation (one row per tone channel). */
export function mixingProfile(): ProductionProfileDocument {
  return validProfile({
    id: 'mixing-two-ink',
    channels: [
      channel({ id: 'a', inkName: 'ink-a', screening: { lpi: 65, angle: 15, dotShape: 'round' } }),
      channel({ id: 'b', inkName: 'ink-b', screening: { lpi: 65, angle: 75, dotShape: 'round' } }),
    ],
    separation: {
      mode: 'linear-mixing',
      matrix: [
        [1, 0, 0],
        [0, 1, 0],
      ],
    },
  });
}
