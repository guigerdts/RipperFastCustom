import { describe, expect, it } from 'vitest';
import {
  PREPARED_ARTWORK_LAYOUTS,
  validateInputContract,
  type InputGateResult,
  type PreparedArtworkSignal,
} from '../../../src/engines/halftone/input';
import {
  isRegisteredIssueCode,
  type ContinuousToneInput,
} from '../../../src/engines/halftone/contracts';

function makeInput(overrides: Record<string, unknown> = {}): ContinuousToneInput {
  return {
    width: 2,
    height: 2,
    ppi: 300,
    bitDepth: 8,
    layout: 'rgb',
    data: new Uint8Array(12).fill(128),
    ...overrides,
  } as unknown as ContinuousToneInput;
}

function codes(result: InputGateResult): string[] {
  return result.issues.map((issue) => issue.code);
}

const acceptedInputs: ReadonlyArray<{ name: string; input: ContinuousToneInput }> = [
  { name: 'RGB 8-bit', input: makeInput() },
  {
    name: 'RGB 16-bit',
    input: makeInput({ bitDepth: 16, data: new Uint16Array(12).fill(30_000) }),
  },
  {
    name: 'grayscale 8-bit',
    input: makeInput({ layout: 'grayscale', data: new Uint8Array(4).fill(128) }),
  },
  {
    name: 'grayscale 16-bit',
    input: makeInput({
      layout: 'grayscale',
      bitDepth: 16,
      data: new Uint16Array(4).fill(30_000),
    }),
  },
];

describe('continuous-tone input acceptance', () => {
  it.each(acceptedInputs)('accepts $name with an explicit PPI', ({ input }) => {
    const result = validateInputContract(input);

    expect(result.status).toBe('accepted');
    expect(result.issues).toEqual([]);
    if (result.status === 'accepted') {
      expect(result.overrides).toEqual([]);
    }
  });
});

describe('explicit PPI', () => {
  it('rejects a missing PPI with input.ppi_missing', () => {
    const result = validateInputContract(makeInput({ ppi: undefined }));

    expect(result.status).toBe('rejected');
    expect(codes(result)).toContain('input.ppi_missing');
    const issue = result.issues.find((entry) => entry.code === 'input.ppi_missing');
    expect(issue?.severity).toBe('error');
    expect(issue?.scope).toBe('input');
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects the non-positive or non-finite PPI %s',
    (ppi) => {
      const result = validateInputContract(makeInput({ ppi }));

      expect(result.status).toBe('rejected');
      expect(codes(result)).toContain('input.invalid_ppi');
    },
  );
});

describe('supported bit depth and layout', () => {
  it.each([4, 12, 32])('rejects the unsupported bit depth %s', (bitDepth) => {
    const result = validateInputContract(makeInput({ bitDepth }));

    expect(result.status).toBe('rejected');
    expect(codes(result)).toContain('input.unsupported_bit_depth');
  });

  it.each(['lab', 'ycbcr', 'unknown'])('rejects the unsupported layout %s', (layout) => {
    const result = validateInputContract(makeInput({ layout }));

    expect(result.status).toBe('rejected');
    expect(codes(result)).toContain('input.unsupported_layout');
  });

  it.each([
    ['width zero', { width: 0 }],
    ['width negative', { width: -2 }],
    ['width fractional', { width: 2.5 }],
    ['height zero', { height: 0 }],
    ['height negative', { height: -1 }],
    ['height fractional', { height: 3.5 }],
  ])('rejects invalid dimensions (%s)', (_name, overrides) => {
    const result = validateInputContract(makeInput(overrides));

    expect(result.status).toBe('rejected');
    expect(codes(result)).toContain('input.invalid_dimensions');
  });
});

describe('raster buffer shape', () => {
  it('rejects a buffer whose length does not match dimensions, layout and depth', () => {
    const result = validateInputContract(makeInput({ data: new Uint8Array(11) }));

    expect(result.status).toBe('rejected');
    const issue = result.issues.find((entry) => entry.code === 'input.data_size_mismatch');
    expect(issue?.context.details?.expectedSamples).toBe(12);
    expect(issue?.context.details?.actualSamples).toBe(11);
  });

  it('rejects a 16-bit declaration backed by an 8-bit buffer', () => {
    const result = validateInputContract(
      makeInput({ bitDepth: 16, data: new Uint8Array(12).fill(128) }),
    );

    expect(result.status).toBe('rejected');
    expect(codes(result)).toContain('input.data_size_mismatch');
  });

  it('rejects a grayscale buffer sized for RGB', () => {
    const result = validateInputContract(
      makeInput({ layout: 'grayscale', data: new Uint8Array(12).fill(128) }),
    );

    expect(result.status).toBe('rejected');
    expect(codes(result)).toContain('input.data_size_mismatch');
  });
});

describe('prepared-artwork detection', () => {
  const preparedFixtures: ReadonlyArray<{
    name: string;
    input: ContinuousToneInput;
    signal: PreparedArtworkSignal;
  }> = [
    {
      name: 'declared source kind',
      input: makeInput({ sourceKind: 'prepared-artwork' }),
      signal: 'source-kind',
    },
    {
      name: 'binary bit depth',
      input: makeInput({ bitDepth: 1, data: new Uint8Array(4) }),
      signal: 'bit-depth',
    },
    {
      name: 'pre-separated layout',
      input: makeInput({ layout: 'cmyk', data: new Uint8Array(16) }),
      signal: 'layout',
    },
    {
      name: 'binary tonal distribution',
      input: makeInput({
        data: new Uint8Array([0, 255, 0, 255, 255, 0, 0, 255, 255, 0, 255, 0]),
      }),
      signal: 'tonal-distribution',
    },
  ];

  it.each(preparedFixtures)('rejects $name with input.prepared_artwork', ({ input, signal }) => {
    const result = validateInputContract(input);

    expect(result.status).toBe('rejected');
    const issue = result.issues.find((entry) => entry.code === 'input.prepared_artwork');
    expect(issue?.severity).toBe('error');
    expect(issue?.scope).toBe('input');
    expect(issue?.context.details?.signals).toContain(signal);
  });

  it.each(PREPARED_ARTWORK_LAYOUTS)('detects the prepared-artwork layout %s', (layout) => {
    const result = validateInputContract(makeInput({ layout, data: new Uint8Array(16) }));

    expect(result.status).toBe('rejected');
    expect(codes(result)).toContain('input.prepared_artwork');
  });

  it('does not flag a uniform solid image as binary tonal distribution', () => {
    const black = validateInputContract(makeInput({ data: new Uint8Array(12) }));
    const white = validateInputContract(makeInput({ data: new Uint8Array(12).fill(255) }));

    expect(black.status).toBe('accepted');
    expect(white.status).toBe('accepted');
  });

  it('detects a 16-bit binary tonal distribution using both extremes', () => {
    const result = validateInputContract(
      makeInput({
        bitDepth: 16,
        data: new Uint16Array([0, 65_535, 0, 65_535, 65_535, 0, 0, 65_535, 65_535, 0, 65_535, 0]),
      }),
    );

    expect(result.status).toBe('rejected');
    const issue = result.issues.find((entry) => entry.code === 'input.prepared_artwork');
    expect(issue?.context.details?.signals).toContain('tonal-distribution');
  });

  it('does not flag a 16-bit image that uses intermediate samples', () => {
    const result = validateInputContract(
      makeInput({
        bitDepth: 16,
        data: new Uint16Array([0, 65_535, 30_000, 65_535, 0, 1, 2, 3, 4, 5, 6, 7]),
      }),
    );

    expect(result.status).toBe('accepted');
    expect(result.issues).toEqual([]);
  });

  it('does not flag a uniform 16-bit image as binary tonal distribution', () => {
    const black = validateInputContract(makeInput({ bitDepth: 16, data: new Uint16Array(12) }));
    const white = validateInputContract(
      makeInput({ bitDepth: 16, data: new Uint16Array(12).fill(65_535) }),
    );

    expect(black.status).toBe('accepted');
    expect(white.status).toBe('accepted');
  });

  it('accepts an acknowledged override of the 16-bit tonal-distribution signal', () => {
    const result = validateInputContract(
      makeInput({
        bitDepth: 16,
        data: new Uint16Array([0, 65_535, 0, 65_535, 65_535, 0, 0, 65_535, 65_535, 0, 65_535, 0]),
        preparedArtworkOverride: {
          acknowledged: true,
          reason: 'posterised 16-bit artwork approved',
        },
      }),
    );

    expect(result.status).toBe('accepted');
    if (result.status === 'accepted') {
      expect(result.overrides[0]?.signals).toEqual(['tonal-distribution']);
    }
  });
});

describe('prepared-artwork override', () => {
  it('rejects an override that is not acknowledged', () => {
    const result = validateInputContract(
      makeInput({
        sourceKind: 'prepared-artwork',
        preparedArtworkOverride: { acknowledged: false, reason: 'customer sent a bitmap' },
      }),
    );

    expect(result.status).toBe('rejected');
    expect(codes(result)).toContain('input.prepared_artwork');
  });

  it.each([
    ['an empty reason', ''],
    ['a whitespace-only reason', '   '],
    ['a tab-and-newline reason', '\t\n '],
  ])('rejects an acknowledged override with %s', (_name, reason) => {
    const result = validateInputContract(
      makeInput({
        sourceKind: 'prepared-artwork',
        preparedArtworkOverride: { acknowledged: true, reason },
      }),
    );

    expect(result.status).toBe('rejected');
    expect(codes(result)).toEqual(['input.prepared_artwork_override_reason_missing']);
    const issue = result.issues[0];
    expect(issue?.severity).toBe('error');
    expect(issue?.scope).toBe('input');
    expect(issue?.context.parameter).toBe('preparedArtworkOverride.reason');
    expect('overrides' in result).toBe(false);
  });

  it('does not emit the reason error for an unacknowledged override with a blank reason', () => {
    const result = validateInputContract(
      makeInput({
        sourceKind: 'prepared-artwork',
        preparedArtworkOverride: { acknowledged: false, reason: '' },
      }),
    );

    expect(result.status).toBe('rejected');
    expect(codes(result)).toEqual(['input.prepared_artwork']);
  });

  it('records a valid reason for the snapshot', () => {
    const result = validateInputContract(
      makeInput({
        sourceKind: 'prepared-artwork',
        preparedArtworkOverride: {
          acknowledged: true,
          reason: 'approved by prepress after email',
        },
      }),
    );

    expect(result.status).toBe('accepted');
    if (result.status === 'accepted') {
      expect(result.overrides).toEqual([
        {
          kind: 'prepared-artwork',
          reason: 'approved by prepress after email',
          signals: ['source-kind'],
        },
      ]);
    }
  });

  it('accepts an acknowledged override, warns and records it for the snapshot', () => {
    const result = validateInputContract(
      makeInput({
        sourceKind: 'prepared-artwork',
        preparedArtworkOverride: { acknowledged: true, reason: 'customer approved rescreening' },
      }),
    );

    expect(result.status).toBe('accepted');
    expect(codes(result)).toEqual(['input.prepared_artwork_override']);
    const issue = result.issues[0];
    expect(issue?.severity).toBe('warning');
    expect(issue?.scope).toBe('input');
    if (result.status === 'accepted') {
      expect(result.overrides).toEqual([
        {
          kind: 'prepared-artwork',
          reason: 'customer approved rescreening',
          signals: ['source-kind'],
        },
      ]);
    }
  });

  it('accepts an acknowledged override of the tonal-distribution signal', () => {
    const result = validateInputContract(
      makeInput({
        data: new Uint8Array([0, 255, 0, 255, 255, 0, 0, 255, 255, 0, 255, 0]),
        preparedArtworkOverride: { acknowledged: true, reason: 'posterised artwork approved' },
      }),
    );

    expect(result.status).toBe('accepted');
    if (result.status === 'accepted') {
      expect(result.overrides[0]?.signals).toEqual(['tonal-distribution']);
    }
  });

  it.each([
    ['binary bit depth', { bitDepth: 1, data: new Uint8Array(4) }],
    ['pre-separated layout', { layout: 'cmyk', data: new Uint8Array(16) }],
  ])('does not let an acknowledgment bypass %s', (_name, overrides) => {
    const result = validateInputContract(
      makeInput({
        ...overrides,
        preparedArtworkOverride: { acknowledged: true, reason: 'attempted override' },
      }),
    );

    expect(result.status).toBe('rejected');
    expect(codes(result)).toContain('input.prepared_artwork');
    if (result.status === 'accepted') {
      expect(result.overrides).toEqual([]);
    }
  });

  it('keeps an unrelated error after an acknowledged override', () => {
    const result = validateInputContract(
      makeInput({
        ppi: undefined,
        sourceKind: 'prepared-artwork',
        preparedArtworkOverride: { acknowledged: true, reason: 'approved' },
      }),
    );

    expect(result.status).toBe('rejected');
    expect(codes(result)).toContain('input.ppi_missing');
    expect(codes(result)).toContain('input.prepared_artwork_override');
  });
});

describe('input gate result shape', () => {
  it('returns a rejected result with no raster, snapshot or stage payload', () => {
    const result = validateInputContract(makeInput({ ppi: undefined }));

    expect(result.status).toBe('rejected');
    expect('data' in result).toBe(false);
    expect('rasters' in result).toBe(false);
    expect('snapshot' in result).toBe(false);
  });

  it('emits only registered codes with the input scope', () => {
    const fixtures: readonly ContinuousToneInput[] = [
      makeInput({ ppi: undefined }),
      makeInput({ bitDepth: 32 }),
      makeInput({ layout: 'lab' }),
      makeInput({ width: 0 }),
      makeInput({ data: new Uint8Array(1) }),
      makeInput({ sourceKind: 'prepared-artwork' }),
      makeInput({
        sourceKind: 'prepared-artwork',
        preparedArtworkOverride: { acknowledged: true, reason: '   ' },
      }),
    ];

    for (const input of fixtures) {
      const result = validateInputContract(input);
      for (const issue of result.issues) {
        expect(isRegisteredIssueCode(issue.code)).toBe(true);
        expect(issue.scope).toBe('input');
      }
    }
  });
});
