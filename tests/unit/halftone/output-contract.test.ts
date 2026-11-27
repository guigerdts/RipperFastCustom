import { describe, expect, it } from 'vitest';

import type {
  ChannelDataKind,
  ContinuousToneInput,
  InkChannel,
  PreviewSettings,
  ProductionProfile,
  SeparationDeclaration,
  TransformIdentity,
} from '../../../src/engines/halftone/contracts';
import { acceptForProduction } from '../../../src/engines/halftone/contracts/output';
import { assembleScreeningResult } from '../../../src/engines/halftone/result';

function makeIdentity(type: 'channel-preserving'): TransformIdentity {
  return {
    id: `${type}-transform`,
    version: '1',
    type,
    parameterHash: 'a'.repeat(64),
    hashAlgorithm: 'sha256',
    canonicalisationVersion: '1',
  };
}

function makeChannel(): InkChannel {
  return {
    id: 'k',
    role: 'black',
    dataKind: 'tone' as ChannelDataKind,
    screening: { method: 'am', frequency: 25, angle: 0, dotShape: 'round' },
  };
}

function grayToBlack(): SeparationDeclaration {
  return {
    mode: 'channel-preserving',
    identity: makeIdentity('channel-preserving'),
    channelMap: { gray: 'k' },
  };
}

function makeInput(): ContinuousToneInput {
  const data = new Uint8Array(16);
  for (let index = 0; index < data.length; index += 1) data[index] = (index * 17) % 256;
  return { width: 4, height: 4, ppi: 100, bitDepth: 8, layout: 'grayscale', data };
}

function makeProfile(): ProductionProfile {
  return {
    id: 'profile',
    version: '1',
    processKind: 'screen-printing',
    channels: [makeChannel()],
    separation: grayToBlack(),
  };
}

function run(options: { preview?: PreviewSettings; isCancelled?: () => boolean } = {}) {
  return assembleScreeningResult({
    request: {
      input: makeInput(),
      profile: makeProfile(),
      output: { dpi: 100 },
      preview: options.preview,
    },
    isCancelled: options.isCancelled,
  });
}

describe('production acceptance contract', () => {
  it('accepts a full-resolution completed result', () => {
    const result = run();
    const acceptance = acceptForProduction(result);
    expect(acceptance.accepted).toBe(true);
    expect(acceptance.issues).toEqual(result.issues);
  });

  it('refuses a preview result as production output', () => {
    const result = run({ preview: { mode: 'divisor', divisor: 2 } });
    const acceptance = acceptForProduction(result);
    expect(acceptance.accepted).toBe(false);

    const refusal = acceptance.issues.find((issue) => issue.code === 'output.preview_not_accepted');
    expect(refusal).toBeDefined();
    expect(refusal?.severity).toBe('error');
    expect(refusal?.scope).toBe('output');
    expect(refusal?.context.offendingValue).toEqual({
      previewResolution: 50,
      productionDpi: 100,
    });
  });

  it('keeps the preview diagnostics before the refusal in a deterministic order', () => {
    const result = run({ preview: { mode: 'divisor', divisor: 2 } });
    const acceptance = acceptForProduction(result);
    const codes = acceptance.issues.map((issue) => issue.code);
    // `output` sorts before `preview`, so the refusal precedes the informational
    // preview issue even though it was appended later.
    expect(codes.indexOf('output.preview_not_accepted')).toBeLessThan(
      codes.indexOf('preview.requested'),
    );
  });

  it('passes rejected results through with their own diagnostics', () => {
    const result = run({ preview: { mode: 'divisor', divisor: 1 } });
    const acceptance = acceptForProduction(result);
    expect(acceptance.accepted).toBe(false);
    expect(acceptance.issues).toEqual(result.issues);
    expect(acceptance.issues.some((issue) => issue.code === 'output.preview_not_accepted')).toBe(
      false,
    );
  });

  it('passes cancelled results through with no production authority', () => {
    const result = run({ isCancelled: () => true });
    const acceptance = acceptForProduction(result);
    expect(acceptance.accepted).toBe(false);
    expect(acceptance.result.status).toBe('cancelled');
  });
});
