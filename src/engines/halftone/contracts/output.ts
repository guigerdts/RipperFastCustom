/**
 * Output/export acceptance contract.
 *
 * A preview run is a diagnostic rendering, not a production deliverable. This
 * seam is the single place that decides whether a result may leave the engine as
 * production output, so a caller cannot accept a reduced-resolution preview by
 * forgetting to check the flag.
 */

import { createIssue, finalizeIssues } from './issue';
import type { Issue } from './issue';
import type { CompletedResult, ScreeningResult } from './result';

export type ProductionAcceptance =
  | {
      readonly accepted: true;
      readonly result: CompletedResult;
      readonly issues: readonly Issue[];
    }
  | {
      readonly accepted: false;
      readonly result: ScreeningResult;
      readonly issues: readonly Issue[];
    };

/**
 * Decides whether a result may be exported as production output.
 *
 * A rejected or cancelled result is refused with its own diagnostics: they
 * already explain why no deliverable exists. A completed preview is refused with
 * `output.preview_not_accepted`, which names the effective preview resolution so
 * the caller can rerun the same request without `preview`.
 */
export function acceptForProduction(result: ScreeningResult): ProductionAcceptance {
  if (result.status !== 'completed') {
    return { accepted: false, result, issues: result.issues };
  }

  if (!result.snapshot.preview.enabled) {
    return { accepted: true, result, issues: result.issues };
  }

  return {
    accepted: false,
    result,
    issues: finalizeIssues([
      ...result.issues,
      createIssue(
        'output.preview_not_accepted',
        'A preview result cannot be exported as production output; rerun without preview.',
        {
          offendingValue: {
            previewResolution: result.snapshot.preview.resolution,
            productionDpi: result.snapshot.output.dpi,
          },
          expected: 'a production run at the declared output resolution',
          parameter: 'preview',
        },
      ),
    ]),
  };
}
