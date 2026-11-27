import { describe, expect, it } from 'vitest';

import type {
  ChannelDataKind,
  ContinuousToneInput,
  InkChannel,
  PreviewSettings,
  ProductionProfile,
  ResultSnapshot,
  SeparationDeclaration,
  TransformIdentity,
} from '../../../src/engines/halftone/contracts';
import { assembleScreeningResult } from '../../../src/engines/halftone/result';

function makeIdentity(
  type: 'channel-preserving' | 'icc',
  hash = 'a'.repeat(64),
): TransformIdentity {
  return {
    id: `${type}-transform`,
    version: '1',
    type,
    parameterHash: hash,
    hashAlgorithm: 'sha256',
    canonicalisationVersion: '1',
  };
}

function makeChannel(overrides: Partial<InkChannel> = {}): InkChannel {
  return {
    id: 'k',
    role: 'black',
    dataKind: 'tone' as ChannelDataKind,
    screening: { method: 'am', frequency: 25, angle: 0, dotShape: 'round' },
    ...overrides,
  };
}

function grayToBlack(): SeparationDeclaration {
  return {
    mode: 'channel-preserving',
    identity: makeIdentity('channel-preserving'),
    channelMap: { gray: 'k' },
  };
}

function makeInput(width = 4, height = 4, ppi = 100): ContinuousToneInput {
  const data = new Uint8Array(width * height);
  for (let index = 0; index < data.length; index += 1) {
    data[index] = (index * 17) % 256;
  }
  return { width, height, ppi, bitDepth: 8, layout: 'grayscale', data };
}

function makeProfile(overrides: Partial<ProductionProfile> = {}): ProductionProfile {
  return {
    id: 'profile',
    version: '1',
    processKind: 'screen-printing',
    channels: [makeChannel()],
    separation: grayToBlack(),
    ...overrides,
  };
}

/** Splits a snapshot into the parts an equivalence assertion treats separately. */
function decompose(snapshot: ResultSnapshot) {
  const { output, preview, hash, ...rest } = snapshot;
  return { output, preview, hash, rest };
}

function run(
  overrides: {
    input?: ContinuousToneInput;
    profile?: ProductionProfile;
    dpi?: number;
    preview?: PreviewSettings;
    isCancelled?: () => boolean;
  } = {},
) {
  return assembleScreeningResult({
    request: {
      input: overrides.input ?? makeInput(),
      profile: overrides.profile ?? makeProfile(),
      output: { dpi: overrides.dpi ?? 100 },
      preview: overrides.preview,
    },
    isCancelled: overrides.isCancelled,
  });
}

describe('preview mode', () => {
  it('is off by default and records an empty preview block', () => {
    const result = run();
    expect(result.status).toBe('completed');
    if (result.status !== 'completed') return;

    expect(result.snapshot.preview).toEqual({ enabled: false, resolution: null });
    expect(result.issues.some((issue) => issue.code === 'preview.requested')).toBe(false);
    expect(result.rasters[0]?.dpi).toBe(100);
  });

  it('flags a divisor preview and records the reduced effective resolution', () => {
    const result = run({ preview: { mode: 'divisor', divisor: 2 } });
    expect(result.status).toBe('completed');
    if (result.status !== 'completed') return;

    expect(result.snapshot.preview).toEqual({ enabled: true, resolution: 50 });
    expect(result.snapshot.output.dpi).toBe(100);
    expect(result.snapshot.canvas.suppliedDpi).toBe(50);
    expect(result.rasters[0]?.dpi).toBe(50);
  });

  it('accepts a target preview DPI strictly below production', () => {
    const result = run({ preview: { mode: 'target-dpi', dpi: 60 } });
    expect(result.status).toBe('completed');
    if (result.status !== 'completed') return;

    expect(result.snapshot.preview).toEqual({ enabled: true, resolution: 60 });
    expect(result.snapshot.output.dpi).toBe(100);
    expect(result.snapshot.canvas.suppliedDpi).toBe(60);
  });

  it('allocates preview rasters at the reduced canvas, never the full one', () => {
    const full = run();
    const preview = run({ preview: { mode: 'divisor', divisor: 2 } });
    expect(full.status).toBe('completed');
    expect(preview.status).toBe('completed');
    if (full.status !== 'completed' || preview.status !== 'completed') return;

    const fullRaster = full.rasters[0];
    const previewRaster = preview.rasters[0];
    expect(fullRaster).toBeDefined();
    expect(previewRaster).toBeDefined();
    if (fullRaster === undefined || previewRaster === undefined) return;

    expect(fullRaster.data).toHaveLength(16);
    expect(previewRaster.data).toHaveLength(4);
    expect(previewRaster.data.length).toBeLessThan(fullRaster.data.length);
    expect(previewRaster.width).toBe(2);
    expect(previewRaster.height).toBe(2);
    expect(preview.snapshot.canvas.width).toBe(2);
    expect(preview.snapshot.canvas.height).toBe(2);
  });

  it('runs the same pipeline: a divisor preview matches a production run at that DPI', () => {
    const preview = run({ dpi: 100, preview: { mode: 'divisor', divisor: 2 } });
    const direct = run({ dpi: 50 });
    expect(preview.status).toBe('completed');
    expect(direct.status).toBe('completed');
    if (preview.status !== 'completed' || direct.status !== 'completed') return;

    // Same stages, same effective resolution: the rasters and every derived
    // snapshot field must match. Only the declared output target differs (100 vs
    // 50) plus the explicit preview flag; the effective resolution is recorded
    // in both `preview.resolution` and `canvas.suppliedDpi`.
    expect(preview.rasters[0]?.data).toEqual(direct.rasters[0]?.data);
    expect(preview.rasters[0]?.width).toBe(direct.rasters[0]?.width);
    expect(preview.rasters[0]?.height).toBe(direct.rasters[0]?.height);
    expect(preview.rasters[0]?.dpi).toBe(direct.rasters[0]?.dpi);
    expect(preview.channels).toEqual(direct.channels);

    const previewParts = decompose(preview.snapshot);
    const directParts = decompose(direct.snapshot);
    expect(previewParts.rest).toEqual(directParts.rest);
    expect(previewParts.output).toEqual({ dpi: 100, lpi: 25 });
    expect(directParts.output).toEqual({ dpi: 50, lpi: 25 });
    expect(previewParts.preview).toEqual({ enabled: true, resolution: 50 });
    expect(directParts.preview).toEqual({ enabled: false, resolution: null });
  });

  it('adds an informational, preview-scoped issue with the effective resolution', () => {
    const result = run({ preview: { mode: 'divisor', divisor: 4 } });
    expect(result.status).toBe('completed');
    if (result.status !== 'completed') return;

    const issue = result.issues.find((entry) => entry.code === 'preview.requested');
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe('info');
    expect(issue?.scope).toBe('preview');
    expect(issue?.context.details).toMatchObject({
      mode: 'divisor',
      productionDpi: 100,
      effectiveResolution: 25,
      divisor: 4,
    });
  });

  it('is deterministic across identical preview runs', () => {
    const first = run({ preview: { mode: 'divisor', divisor: 2 } });
    const second = run({ preview: { mode: 'divisor', divisor: 2 } });
    expect(first.status).toBe('completed');
    expect(second.status).toBe('completed');
    if (first.status !== 'completed' || second.status !== 'completed') return;

    expect(first.rasters[0]?.data).toEqual(second.rasters[0]?.data);
    expect(first.snapshot.hash).toBe(second.snapshot.hash);
    expect(first.issues).toEqual(second.issues);
  });

  it('keeps production validation: an unsupported production DPI is still rejected', () => {
    const profile = makeProfile({ allowedOutputResolutions: [100] });
    const result = run({ dpi: 144, profile, preview: { mode: 'divisor', divisor: 2 } });
    expect(result.status).toBe('rejected');
    if (result.status !== 'rejected') return;
    expect(result.issues.some((issue) => issue.code === 'output.unsupported_resolution')).toBe(
      true,
    );
  });

  it('returns cancelled with no rasters or snapshot when cancelled during preview', () => {
    const result = run({ preview: { mode: 'divisor', divisor: 2 }, isCancelled: () => true });
    expect(result.status).toBe('cancelled');
    expect('rasters' in result).toBe(false);
    expect('snapshot' in result).toBe(false);
  });

  it('rejects an unusable preview setting before allocating, with no rasters or snapshot', () => {
    const result = run({ preview: { mode: 'divisor', divisor: 1 } });
    expect(result.status).toBe('rejected');
    if (result.status !== 'rejected') return;

    expect(result.issues.some((issue) => issue.code === 'preview.invalid_settings')).toBe(true);
    expect(result.issues.some((issue) => issue.severity === 'error')).toBe(true);
    expect('rasters' in result).toBe(false);
    expect('snapshot' in result).toBe(false);
  });

  it('rejects a preview whose reduced canvas collapses to zero', () => {
    const result = run({ preview: { mode: 'target-dpi', dpi: 1 } });
    expect(result.status).toBe('rejected');
    if (result.status !== 'rejected') return;
    expect(result.issues.some((issue) => issue.code === 'geometry.empty_canvas')).toBe(true);
  });
});
