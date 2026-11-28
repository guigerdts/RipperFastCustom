/**
 * The one explicit adapter from a production-profile document to the engine.
 *
 * Everything the engine needs is derived here, and nothing else:
 *
 * - channels become `InkChannel`s with the ink name as the engine role and LPI
 *   as the engine frequency (a unit change, not a value change);
 * - a profile separation becomes a `SeparationDeclaration` whose identity is
 *   computed from the effective mapping through the engine's own canonical form.
 *   No user-supplied hash is trusted: the hash is a consequence of the
 *   declaration, so it cannot claim to describe a different transform.
 *
 * The adapter never throws for an invalid profile. It validates the document
 * first and returns the diagnostics; the caller decides what to show. When the
 * profile is usable it still runs the engine's own request validation and
 * reports those issues, so a "ready" request is one the engine accepts.
 */

import type {
  ContinuousToneInput,
  InkChannel,
  Issue,
  ProductionProfile,
  ScreeningRequest,
  SeparationDeclaration,
  TransformIdentity,
} from '../../../engines/halftone/contracts';
import { CANONICALISATION_VERSION, HASH_ALGORITHMS } from '../../../engines/halftone/contracts';
import { validateScreeningRequest } from '../../../engines/halftone/contracts';
import { hashCanonical } from '../../../engines/halftone/canonical';
import type { CanonicalValue } from '../../../engines/halftone/canonical';
import type { ProfileIssue } from './diagnostics';
import { hasProfileErrors } from './diagnostics';
import type { ProfileChannel, ProductionProfileDocument } from './model';
import { validateProfileDocument } from './validation';

/** A diagnostic tagged with the stage that produced it. */
export type AdapterDiagnostic =
  | { readonly stage: 'profile'; readonly issue: ProfileIssue }
  | { readonly stage: 'engine'; readonly issue: Issue };

export interface AdapterResult {
  /**
   * A well-formed engine request. Present when the profile document has no
   * blocking errors; may still carry engine errors that would reject the run.
   */
  readonly request: ScreeningRequest | null;
  readonly profile: ProductionProfile | null;
  /** Profile diagnostics first, then engine diagnostics. */
  readonly diagnostics: readonly AdapterDiagnostic[];
  /** True only when no diagnostic at either stage is an error. */
  readonly ready: boolean;
}

function toInkChannel(channel: ProfileChannel): InkChannel {
  return {
    id: channel.id,
    role: channel.inkName,
    dataKind: channel.dataKind,
    screening: {
      method: 'am',
      frequency: channel.screening.lpi,
      angle: channel.screening.angle,
      dotShape: channel.screening.dotShape,
    },
  };
}

function identityFor(
  document: ProductionProfileDocument,
  type: TransformIdentity['type'],
  payload: CanonicalValue,
): TransformIdentity {
  return {
    id: `profile:${document.id}:separation`,
    version: document.version,
    type,
    parameterHash: hashCanonical(payload),
    hashAlgorithm: HASH_ALGORITHMS[0],
    canonicalisationVersion: CANONICALISATION_VERSION,
  };
}

function toSeparationDeclaration(document: ProductionProfileDocument): SeparationDeclaration {
  const separation = document.separation;
  if (separation.mode === 'channel-preserving') {
    return {
      mode: 'channel-preserving',
      identity: identityFor(document, 'channel-preserving', {
        mode: 'channel-preserving',
        channelMap: separation.channelMap,
      }),
      channelMap: separation.channelMap,
    };
  }

  return {
    mode: 'linear-mixing',
    identity: identityFor(document, 'linear-mixing', {
      mode: 'linear-mixing',
      matrix: separation.matrix,
    }),
    matrix: separation.matrix,
  };
}

/** Maps a profile document to the engine's profile contract. Pure. */
export function toEngineProfile(document: ProductionProfileDocument): ProductionProfile {
  return {
    id: document.id,
    version: document.version,
    processKind: document.processKind,
    channels: document.channels.map(toInkChannel),
    separation: toSeparationDeclaration(document),
    ...(document.output.allowedResolutions !== null
      ? { allowedOutputResolutions: document.output.allowedResolutions }
      : {}),
    ...(document.constraints.minimumCellPixels !== null
      ? { minimumCellPixels: document.constraints.minimumCellPixels }
      : {}),
    ...(document.constraints.minimumInputSamplesPerScreenLine !== null
      ? {
          minimumInputSamplesPerScreenLine: document.constraints.minimumInputSamplesPerScreenLine,
        }
      : {}),
  };
}

/** Builds the engine request envelope for a profile and a source raster. Pure. */
export function toScreeningRequest(
  document: ProductionProfileDocument,
  input: ContinuousToneInput,
): ScreeningRequest {
  return {
    input,
    profile: toEngineProfile(document),
    output: { dpi: document.output.dpi },
  };
}

/**
 * Validates the profile, then adapts it and validates the resulting request
 * against the engine contract. Never throws; every problem is a diagnostic.
 */
export function adaptProfileToRequest(
  document: ProductionProfileDocument,
  input: ContinuousToneInput,
): AdapterResult {
  const profileIssues = validateProfileDocument(document);
  const profileDiagnostics: AdapterDiagnostic[] = profileIssues.map((issue) => ({
    stage: 'profile',
    issue,
  }));

  if (hasProfileErrors(profileIssues)) {
    return { request: null, profile: null, diagnostics: profileDiagnostics, ready: false };
  }

  const request = toScreeningRequest(document, input);
  const engineIssues = validateScreeningRequest(request);
  const engineDiagnostics: AdapterDiagnostic[] = engineIssues.map((issue) => ({
    stage: 'engine',
    issue,
  }));

  return {
    request,
    profile: request.profile,
    diagnostics: [...profileDiagnostics, ...engineDiagnostics],
    ready: !engineIssues.some((issue) => issue.severity === 'error'),
  };
}
