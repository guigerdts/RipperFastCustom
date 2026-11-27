/**
 * Preview mode resolution.
 *
 * Preview is not a second pipeline: the same input gate, separation, tonal
 * chain, geometry, sampling and thresholding run unchanged. Only the effective
 * output resolution is reduced, so the lattice and thresholding stay the same
 * at a coarser raster and no full-resolution buffer is allocated.
 *
 * This module owns exactly two decisions: what the effective resolution is, and
 * whether the requested setting is usable. A setting the engine cannot honour is
 * rejected instead of being silently replaced by a default.
 */

import { createIssue, toJsonValue } from './contracts/issue';
import type { Issue } from './contracts/issue';
import type { PreviewSettings } from './contracts/request';

/** The effective output resolution the pipeline will use. */
export type PreviewResolution =
  | { readonly mode: 'disabled'; readonly resolution: number }
  | { readonly mode: 'preview'; readonly resolution: number; readonly settings: PreviewSettings }
  | { readonly mode: 'rejected'; readonly issues: readonly Issue[] };

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function rejected(
  message: string,
  offendingValue: unknown,
  expected: string,
  parameter: string,
): PreviewResolution {
  return {
    mode: 'rejected',
    issues: [
      createIssue('preview.invalid_settings', message, {
        offendingValue: toJsonValue(offendingValue),
        expected,
        parameter,
      }),
    ],
  };
}

/**
 * Derives the effective output resolution from an optional preview setting.
 *
 * `productionDpi` is the resolution the request declares; a preview only ever
 * lowers it. A divisor must be an integer of at least 2 — a divisor of 1 would
 * reproduce the full raster and defeat the mode — and a target DPI must be
 * finite, positive and strictly below the production DPI.
 *
 * An invalid production DPI is left to the output stage: canvas computation owns
 * that error and reports it with its canonical code, so preview does not
 * duplicate the diagnosis.
 */
export function resolvePreview(
  productionDpi: number,
  settings: PreviewSettings | undefined,
): PreviewResolution {
  if (settings === undefined) return { mode: 'disabled', resolution: productionDpi };
  if (!isPositiveFinite(productionDpi)) return { mode: 'disabled', resolution: productionDpi };

  if (settings.mode === 'divisor') {
    const divisor: unknown = settings.divisor;
    if (typeof divisor !== 'number' || !Number.isInteger(divisor) || divisor < 2) {
      return rejected(
        'A preview divisor must be an integer of at least 2.',
        divisor,
        'an integer divisor >= 2',
        'preview.divisor',
      );
    }
    const resolution = productionDpi / divisor;
    if (!isPositiveFinite(resolution)) {
      return rejected(
        'The preview divisor does not produce a usable resolution.',
        toJsonValue({ productionDpi, divisor }),
        'a finite preview resolution > 0',
        'preview.divisor',
      );
    }
    return { mode: 'preview', resolution, settings };
  }

  if (settings.mode === 'target-dpi') {
    const dpi: unknown = settings.dpi;
    if (!isPositiveFinite(dpi) || dpi >= productionDpi) {
      return rejected(
        'A preview target DPI must be finite, positive and below the production DPI.',
        dpi,
        `a target DPI > 0 and < ${productionDpi}`,
        'preview.dpi',
      );
    }
    return { mode: 'preview', resolution: dpi, settings };
  }

  return rejected(
    'A preview setting must declare either an integer divisor or a target DPI.',
    toJsonValue(settings),
    "mode 'divisor' or 'target-dpi'",
    'preview.mode',
  );
}

/** The informational issue that records an honoured preview request. */
export function previewRequestedIssue(
  settings: PreviewSettings,
  productionDpi: number,
  effectiveResolution: number,
): Issue {
  return createIssue(
    'preview.requested',
    'The request asks for a preview; rasters are produced at the reduced preview resolution.',
    {
      parameter: 'preview',
      details: {
        mode: settings.mode,
        productionDpi,
        effectiveResolution,
        ...(settings.mode === 'divisor'
          ? { divisor: settings.divisor }
          : { targetDpi: settings.dpi }),
      },
    },
  );
}
