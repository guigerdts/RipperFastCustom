import { describe, expect, it } from 'vitest';

import type { PreviewSettings } from '../../../src/engines/halftone/contracts';
import { resolvePreview } from '../../../src/engines/halftone/preview';

describe('preview resolution derivation', () => {
  it('stays disabled without settings and keeps the production resolution', () => {
    expect(resolvePreview(300, undefined)).toEqual({ mode: 'disabled', resolution: 300 });
  });

  it('divides the production DPI by an integer divisor', () => {
    expect(resolvePreview(300, { mode: 'divisor', divisor: 2 })).toEqual({
      mode: 'preview',
      resolution: 150,
      settings: { mode: 'divisor', divisor: 2 },
    });
  });

  it('accepts a target DPI strictly below production', () => {
    expect(resolvePreview(300, { mode: 'target-dpi', dpi: 72 })).toEqual({
      mode: 'preview',
      resolution: 72,
      settings: { mode: 'target-dpi', dpi: 72 },
    });
  });

  it('leaves an invalid production DPI to the output stage', () => {
    // Canvas computation owns the invalid-resolution diagnosis; preview must not
    // duplicate it with a second code.
    expect(resolvePreview(0, { mode: 'divisor', divisor: 2 })).toEqual({
      mode: 'disabled',
      resolution: 0,
    });
  });

  it.each([
    ['a divisor of 1', { mode: 'divisor', divisor: 1 } as PreviewSettings],
    ['a zero divisor', { mode: 'divisor', divisor: 0 } as PreviewSettings],
    ['a negative divisor', { mode: 'divisor', divisor: -2 } as PreviewSettings],
    ['a non-integer divisor', { mode: 'divisor', divisor: 1.5 } as PreviewSettings],
    ['a zero target DPI', { mode: 'target-dpi', dpi: 0 } as PreviewSettings],
    ['a negative target DPI', { mode: 'target-dpi', dpi: -10 } as PreviewSettings],
    ['a target equal to production', { mode: 'target-dpi', dpi: 300 } as PreviewSettings],
    ['a target above production', { mode: 'target-dpi', dpi: 600 } as PreviewSettings],
    ['an unknown mode', { mode: 'bogus' } as unknown as PreviewSettings],
  ])('rejects %s with preview.invalid_settings', (_label, settings) => {
    const resolution = resolvePreview(300, settings);
    expect(resolution.mode).toBe('rejected');
    if (resolution.mode !== 'rejected') return;

    expect(resolution.issues).toHaveLength(1);
    expect(resolution.issues[0]?.code).toBe('preview.invalid_settings');
    expect(resolution.issues[0]?.severity).toBe('error');
    expect(resolution.issues[0]?.scope).toBe('preview');
  });
});
