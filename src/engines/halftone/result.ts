/**
 * Result assembly for the halftone engine.
 *
 * The pipeline runs the existing stages in order — input gate, separation,
 * tonal chain — and then composes one binary raster per ink channel at the
 * output resolution, plus a sealed self-contained snapshot.
 *
 * Determinism is structural: every output pixel's value is a pure function of
 * its global cell, the sampled tonal value for that cell and the spot function.
 * A tile therefore only restricts *which* pixels are written, never *how* they
 * are computed, so whole-image and tiled runs are byte-identical by
 * construction rather than by special-casing.
 */

import { hashCanonical, sha256Hex } from './canonical';
import { createIssue, resolveOutcomeStatus, toJsonValue } from './contracts/issue';
import type { Issue } from './contracts/issue';
import { CANONICALISATION_VERSION } from './contracts/separation';
import type { IccConverter, MaskSource, SeparationDeclaration } from './contracts/separation';
import type { ContinuousToneInput, ScreeningRequest } from './contracts/request';
import type { InkChannel, ProductionProfile } from './contracts/profile';
import type { AmScreeningConfiguration } from './contracts/screening';
import type { AddressabilityReport, SamplingImage } from './contracts/screening';
import type {
  ChannelRaster,
  ChannelResultMetadata,
  CompletedResult,
  OutputTile,
  ResultSnapshot,
  SamplingRule,
  ScreeningResult,
  SnapshotChannel,
  SnapshotSeparation,
  UnsealedSnapshot,
} from './contracts/result';
import { HALFTONE_ENGINE_VERSION, TONAL_QUANTISATION_RULE } from './contracts/result';
import type { TonalChannelResult, TonalStageSummary } from './contracts/tonal';
import { cellFootprint, cellIndexRange, computeCanvas, createLattice } from './geometry';
import type { CanvasDimensions, Lattice } from './contracts/geometry';
import { validateInputContract } from './input';
import { computeAddressability, rasterizeCell, sampleCellValue } from './screening';
import { separate } from './separation';
import { sealSnapshot, toCanonicalValue } from './snapshot';
import { applyTonalChain } from './tonal';

/**
 * Largest raster this engine will allocate per channel. It bounds one
 * allocation, not the whole job; a run above it is rejected instead of
 * exhausting memory.
 */
export const MAX_RASTER_PIXELS = 100_000_000;

/** Everything the assembler reads. */
export interface AssembleInput<TProcessAttributes = never> {
  readonly request: ScreeningRequest<TProcessAttributes>;
  readonly iccConverter?: IccConverter;
  readonly maskSources?: readonly MaskSource[];
  /**
   * When present, only pixels inside these tiles are written. The raster is
   * still full-canvas and every pixel is still computed, so the values never
   * depend on the partition; a union of tiles that covers the canvas produces
   * exactly the whole-image bytes.
   */
  readonly tiles?: readonly OutputTile[];
  /** Consulted between channels; a true result yields a cancelled run. */
  readonly isCancelled?: () => boolean;
}

function screeningOf(channel: InkChannel): AmScreeningConfiguration | undefined {
  const screening = channel.screening;
  if (screening === undefined || screening === null) return undefined;
  if ((screening as { method?: unknown }).method !== 'am') return undefined;
  return screening as AmScreeningConfiguration;
}

function summarize(fractions: readonly number[]): TonalStageSummary {
  if (fractions.length === 0) {
    return { min: 0, max: 0, mean: 0, atZero: 0, atOne: 0 };
  }
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let sum = 0;
  let atZero = 0;
  let atOne = 0;

  for (const value of fractions) {
    min = Math.min(min, value);
    max = Math.max(max, value);
    sum += value;
    if (value === 0) atZero += 1;
    if (value === 1) atOne += 1;
  }

  return { min, max, mean: sum / fractions.length, atZero, atOne };
}

function normalizedPlane(data: Uint16Array, width: number, height: number): SamplingImage {
  const samples = new Float64Array(width * height);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = (data[index] ?? 0) / 0xffff;
  }
  return { data: samples, width, height };
}

function transformIdentityOf(declaration: SeparationDeclaration): SnapshotSeparation['identity'] {
  return {
    id: declaration.identity.id,
    version: declaration.identity.version,
    type: declaration.identity.type,
    parameterHash: declaration.identity.parameterHash,
    hashAlgorithm: declaration.identity.hashAlgorithm,
    canonicalisationVersion: declaration.identity.canonicalisationVersion,
  };
}

interface CapturedSeparation {
  readonly ok: boolean;
  readonly issues: readonly Issue[];
  readonly snapshot: SnapshotSeparation | null;
}

/**
 * Captures the separation declaration for the snapshot. An ICC transform must
 * carry its profile bytes and they must match the recorded hashes; a hash
 * alone cannot reproduce the run.
 */
function captureSeparation(declaration: SeparationDeclaration | undefined): CapturedSeparation {
  if (declaration === undefined) {
    return {
      ok: false,
      issues: [
        createIssue(
          'separation.undeclared_mapping',
          'The profile declares no separation mapping.',
          {
            parameter: 'profile.separation',
          },
        ),
      ],
      snapshot: null,
    };
  }

  const identity = transformIdentityOf(declaration);

  if (declaration.mode === 'channel-preserving') {
    return {
      ok: true,
      issues: [],
      snapshot: {
        mode: 'channel-preserving',
        identity,
        channelMap: declaration.channelMap,
        transferFunctions: declaration.transferFunctions ?? {},
      },
    };
  }

  if (declaration.mode === 'linear-mixing') {
    return {
      ok: true,
      issues: [],
      snapshot: {
        mode: 'linear-mixing',
        identity,
        matrix: declaration.matrix,
        transferFunctions: declaration.transferFunctions ?? {},
      },
    };
  }

  const issues: Issue[] = [];

  const check = (
    name: 'source' | 'destination',
    bytes: Uint8Array | undefined,
    expected: string,
  ): Uint8Array => {
    if (!(bytes instanceof Uint8Array) || bytes.length === 0) {
      issues.push(
        createIssue(
          'separation.unreproducible_transform',
          `The ICC ${name} profile bytes were not captured, so the run cannot be reproduced.`,
          {
            expected: `captured ${name} profile bytes`,
            parameter: `${name}ProfileBytes`,
            details: { recordedHash: expected },
          },
        ),
      );
      return new Uint8Array(0);
    }

    const actual = sha256Hex(bytes);
    if (actual !== expected) {
      issues.push(
        createIssue(
          'separation.unreproducible_transform',
          `The ICC ${name} profile bytes do not match the recorded hash.`,
          {
            offendingValue: actual,
            expected,
            parameter: `${name}ProfileHash`,
          },
        ),
      );
    }
    return new Uint8Array(bytes);
  };

  const capturedSource = check(
    'source',
    declaration.sourceProfileBytes,
    declaration.provenance.sourceProfileHash,
  );
  const capturedDestination = check(
    'destination',
    declaration.destinationProfileBytes,
    declaration.provenance.destinationProfileHash,
  );

  if (issues.length > 0) return { ok: false, issues, snapshot: null };

  return {
    ok: true,
    issues: [],
    snapshot: {
      mode: 'icc',
      identity,
      provenance: {
        sourceProfileId: declaration.provenance.sourceProfileId,
        sourceProfileHash: declaration.provenance.sourceProfileHash,
        destinationProfileId: declaration.provenance.destinationProfileId,
        destinationProfileHash: declaration.provenance.destinationProfileHash,
        renderingIntent: declaration.provenance.renderingIntent,
        blackPointCompensation: declaration.provenance.blackPointCompensation,
      },
      sourceProfileBytes: capturedSource,
      destinationProfileBytes: capturedDestination,
    },
  };
}

/**
 * The effective separation parameters, without the ICC profile bytes. The
 * bytes are content, not parameters; they are hashed by the provenance and by
 * the snapshot hash itself.
 */
function separationParameterValue(
  separation: SeparationDeclaration | undefined,
): ReturnType<typeof toCanonicalValue> {
  if (separation === undefined) return null;

  const identity = { ...separation.identity };

  if (separation.mode === 'channel-preserving') {
    return toCanonicalValue({
      mode: separation.mode,
      identity,
      channelMap: separation.channelMap,
      transferFunctions: separation.transferFunctions ?? {},
    });
  }

  if (separation.mode === 'linear-mixing') {
    return toCanonicalValue({
      mode: separation.mode,
      identity,
      matrix: separation.matrix,
      transferFunctions: separation.transferFunctions ?? {},
    });
  }

  return toCanonicalValue({
    mode: separation.mode,
    identity,
    provenance: { ...separation.provenance },
  });
}

function profileParameterHash(profile: ProductionProfile<unknown>): string {
  const value = toCanonicalValue({
    id: profile.id,
    version: profile.version,
    processKind: profile.processKind,
    minimumCellPixels: profile.minimumCellPixels ?? null,
    allowedOutputResolutions: profile.allowedOutputResolutions ?? [],
    channels: profile.channels.map((channel) => ({
      id: channel.id,
      role: channel.role,
      dataKind: channel.dataKind,
      screening: channel.screening,
      trc: channel.trc ?? null,
      limits: channel.limits ?? null,
    })),
    separation: separationParameterValue(profile.separation),
  });
  return hashCanonical(value);
}

/** The value shared by every entry, or `null` when they disagree. */
function commonValue(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const first = values[0];
  if (first === undefined) return null;
  return values.every((value) => value === first) ? first : null;
}

interface WriteMask {
  readonly ok: boolean;
  readonly issues: readonly Issue[];
  readonly mask: Uint8Array | null;
}

/**
 * Builds the write mask once for the whole job. A tile outside the canvas is
 * clipped; a tile with a non-positive or non-finite extent is rejected rather
 * than silently ignored.
 */
function buildWriteMask(
  tiles: readonly OutputTile[] | undefined,
  canvas: CanvasDimensions,
): WriteMask {
  if (tiles === undefined) return { ok: true, issues: [], mask: null };

  const issues: Issue[] = [];
  const mask = new Uint8Array(canvas.width * canvas.height);

  for (const tile of tiles) {
    const valid =
      Number.isFinite(tile.x) &&
      Number.isFinite(tile.y) &&
      Number.isFinite(tile.width) &&
      Number.isFinite(tile.height) &&
      Number.isInteger(tile.x) &&
      Number.isInteger(tile.y) &&
      Number.isInteger(tile.width) &&
      Number.isInteger(tile.height) &&
      tile.width > 0 &&
      tile.height > 0;

    if (!valid) {
      issues.push(
        createIssue('output.invalid_dimension', 'An output tile has an unusable extent.', {
          offendingValue: toJsonValue(tile),
          expected: 'integer x and y with positive integer width and height',
          parameter: 'tiles',
        }),
      );
      continue;
    }

    const x0 = Math.max(0, tile.x);
    const y0 = Math.max(0, tile.y);
    const x1 = Math.min(canvas.width, tile.x + tile.width);
    const y1 = Math.min(canvas.height, tile.y + tile.height);

    for (let y = y0; y < y1; y += 1) {
      const row = y * canvas.width;
      for (let x = x0; x < x1; x += 1) mask[row + x] = 1;
    }
  }

  return { ok: issues.length === 0, issues, mask };
}

interface ChannelAssembly {
  readonly ok: true;
  readonly raster: ChannelRaster;
  readonly metadata: ChannelResultMetadata;
  readonly snapshotChannel: SnapshotChannel;
}

interface ChannelAssemblyFailure {
  readonly ok: false;
  readonly issues: readonly Issue[];
}

/** Assembles the completed result for one channel, or reports why it cannot. */
function assembleChannel(options: {
  readonly channel: TonalChannelResult;
  readonly declared: InkChannel;
  readonly screening: AmScreeningConfiguration;
  readonly transformIdentity: string;
  readonly input: ContinuousToneInput;
  readonly canvas: CanvasDimensions;
  readonly outputLattice: Lattice;
  readonly writeMask: Uint8Array | null;
}): ChannelAssembly | ChannelAssemblyFailure {
  const { channel, declared, screening, input, canvas, outputLattice, writeMask } = options;

  const inputLatticeResult = createLattice({
    resolution: input.ppi,
    lpi: screening.frequency,
    angle: screening.angle,
  });
  if (inputLatticeResult.status === 'rejected') {
    return { ok: false, issues: inputLatticeResult.issues };
  }

  const addressability = computeAddressability({
    lattice: outputLattice,
    canvas,
    dotShape: screening.dotShape,
  });
  if (addressability.status === 'rejected') {
    return { ok: false, issues: addressability.issues };
  }

  const image = normalizedPlane(channel.reproducible, input.width, input.height);
  const raster = new Uint8Array(canvas.width * canvas.height);
  const fractions: number[] = [];
  let fallbackUsed: SamplingRule = 'area-coverage';

  const range = cellIndexRange(outputLattice, canvas);

  for (let j = range.minJ; j <= range.maxJ; j += 1) {
    for (let i = range.minI; i <= range.maxI; i += 1) {
      const sampled = sampleCellValue({
        footprint: cellFootprint(i, j, inputLatticeResult.lattice),
        image,
      });
      if (sampled.status === 'rejected') return { ok: false, issues: sampled.issues };
      if (sampled.fallback === 'containing-pixel') fallbackUsed = 'containing-pixel';

      const rasterized = rasterizeCell({
        footprint: cellFootprint(i, j, outputLattice),
        canvas,
        lattice: outputLattice,
        value: sampled.value,
        dotShape: screening.dotShape,
      });
      if (rasterized.status === 'rejected') return { ok: false, issues: rasterized.issues };
      if (!rasterized.evaluated) continue;

      for (const pixel of rasterized.pixels) {
        const index = pixel.l * canvas.width + pixel.k;
        if (writeMask !== null && writeMask[index] === 0) continue;
        raster[index] = pixel.marked ? 1 : 0;
      }

      if (rasterized.fraction !== null) fractions.push(rasterized.fraction);
    }
  }

  const report: AddressabilityReport = addressability.report;

  const metadata: ChannelResultMetadata = {
    channelId: channel.id,
    role: declared.role,
    dataKind: declared.dataKind,
    separationTransformId: options.transformIdentity,
    frequency: screening.frequency,
    angle: screening.angle,
    dotShape: screening.dotShape,
    samplingRule: fallbackUsed,
    trc: channel.trc,
    trcApplied: channel.trcApplied,
    limits: channel.limits,
    limitsApplied: channel.limitsApplied,
    addressability: report,
    summaries: {
      commanded: channel.summaries.commanded,
      corrected: channel.summaries.corrected,
      reproducible: channel.summaries.reproducible,
      screened: summarize(fractions),
    },
  };

  const snapshotChannel: SnapshotChannel = {
    channelId: channel.id,
    role: declared.role,
    dataKind: declared.dataKind,
    separationTransformId: options.transformIdentity,
    frequency: screening.frequency,
    angle: screening.angle,
    dotShape: screening.dotShape,
    samplingRule: fallbackUsed,
    trc: channel.trc,
    trcApplied: channel.trcApplied,
    limits: channel.limits,
    limitsApplied: channel.limitsApplied,
    cellPixelCount: report.cellPixelCount,
    addressableCoverageCount: report.addressableCoverageCount,
  };

  return {
    ok: true,
    raster: {
      channelId: channel.id,
      role: declared.role,
      dataKind: declared.dataKind,
      width: canvas.width,
      height: canvas.height,
      dpi: canvas.dpi,
      bitsPerPixel: 1,
      data: raster,
    },
    metadata,
    snapshotChannel,
  };
}

/**
 * Runs the pipeline and assembles the result envelope.
 *
 * A rejection anywhere before composition returns a rejected envelope with
 * every structured diagnostic collected so far and no raster or snapshot. A
 * cancellation returns a cancelled envelope with the diagnostics collected up
 * to the cancellation point, never a partially built result labelled complete.
 */
export function assembleScreeningResult<TProcessAttributes = never>(
  input: AssembleInput<TProcessAttributes>,
): ScreeningResult {
  const request = input.request;

  if (input.isCancelled?.()) {
    return { status: 'cancelled', issues: [] };
  }

  const gate = validateInputContract(request.input);
  if (gate.status === 'rejected') {
    return { status: 'rejected', issues: gate.issues };
  }

  const separated = separate({
    input: request.input,
    profile: request.profile,
    iccConverter: input.iccConverter,
    maskSources: input.maskSources,
  });
  if (separated.status === 'rejected') {
    return { status: 'rejected', issues: separated.issues };
  }

  const captured = captureSeparation(request.profile.separation);
  if (!captured.ok || captured.snapshot === null) {
    return { status: 'rejected', issues: captured.issues };
  }

  const tonal = applyTonalChain({
    channels: separated.channels.map((channel) => {
      const declared = request.profile.channels.find((entry) => entry.id === channel.id);
      return {
        id: channel.id,
        commanded: channel.data,
        trc: declared?.trc,
        limits: declared?.limits,
      };
    }),
  });
  if (tonal.status === 'rejected') {
    return { status: 'rejected', issues: tonal.issues };
  }

  const canvasResult = computeCanvas({
    inputWidth: request.input.width,
    inputHeight: request.input.height,
    ppi: request.input.ppi,
    dpi: request.output.dpi,
  });
  if (canvasResult.status === 'rejected') {
    return { status: 'rejected', issues: canvasResult.issues };
  }
  const canvas = canvasResult.canvas;

  const pixels = canvas.width * canvas.height;
  if (!Number.isFinite(pixels) || pixels <= 0 || pixels > MAX_RASTER_PIXELS) {
    return {
      status: 'rejected',
      issues: [
        createIssue('output.invalid_dimension', 'The output raster dimensions are not usable.', {
          offendingValue: toJsonValue({ width: canvas.width, height: canvas.height }),
          expected: `at most ${MAX_RASTER_PIXELS} pixels per channel`,
          parameter: 'output',
        }),
      ],
    };
  }

  const writeMask = buildWriteMask(input.tiles, canvas);
  if (!writeMask.ok) {
    return { status: 'rejected', issues: writeMask.issues };
  }

  const issues: Issue[] = [...gate.issues, ...separated.issues, ...tonal.issues];
  const rasters: ChannelRaster[] = [];
  const channels: ChannelResultMetadata[] = [];
  const snapshotChannels: SnapshotChannel[] = [];
  const channelOrder: string[] = [];

  let referenceLattice: Lattice | null = null;
  let referenceChannelId = '';
  const frequencies: number[] = [];

  for (const channel of tonal.channels) {
    if (input.isCancelled?.()) {
      return { status: 'cancelled', issues };
    }

    const declared = request.profile.channels.find((entry) => entry.id === channel.id);
    const screening = declared === undefined ? undefined : screeningOf(declared);
    if (declared === undefined || screening === undefined) {
      issues.push(
        createIssue('profile.missing_am_parameter', 'The channel declares no AM screening.', {
          channel: channel.id,
          expected: 'am screening with frequency, angle and dot shape',
          parameter: 'screening',
        }),
      );
      return { status: 'rejected', issues };
    }

    const separatedChannel = separated.channels.find((entry) => entry.id === channel.id);
    if (separatedChannel === undefined) {
      issues.push(
        createIssue(
          'separation.unidentifiable_transform',
          'The channel has no separation transform identity.',
          { channel: channel.id, parameter: 'separation' },
        ),
      );
      return { status: 'rejected', issues };
    }

    const outputLatticeResult = createLattice({
      resolution: canvas.dpi,
      lpi: screening.frequency,
      angle: screening.angle,
    });
    if (outputLatticeResult.status === 'rejected') {
      return { status: 'rejected', issues: [...issues, ...outputLatticeResult.issues] };
    }

    const assembled = assembleChannel({
      channel,
      declared,
      screening,
      transformIdentity: separatedChannel.transformIdentity,
      input: request.input,
      canvas,
      outputLattice: outputLatticeResult.lattice,
      writeMask: writeMask.mask,
    });

    if (!assembled.ok) {
      return { status: 'rejected', issues: [...issues, ...assembled.issues] };
    }

    if (referenceLattice === null) {
      referenceLattice = outputLatticeResult.lattice;
      referenceChannelId = channel.id;
    }
    frequencies.push(screening.frequency);

    rasters.push(assembled.raster);
    channels.push(assembled.metadata);
    snapshotChannels.push(assembled.snapshotChannel);
    channelOrder.push(channel.id);
  }

  if (referenceLattice === null) {
    return {
      status: 'rejected',
      issues: [
        createIssue('profile.missing_am_parameter', 'The profile produced no channel to compose.', {
          parameter: 'profile.channels',
        }),
      ],
    };
  }

  const commonFrequency = commonValue(frequencies);

  const unsealed: UnsealedSnapshot = {
    canonicalisationVersion: CANONICALISATION_VERSION,
    hashAlgorithm: 'sha256',
    engine: { version: HALFTONE_ENGINE_VERSION, quantisationRule: TONAL_QUANTISATION_RULE },
    profile: {
      id: request.profile.id,
      version: request.profile.version,
      parameterHash: profileParameterHash(request.profile as ProductionProfile<unknown>),
    },
    process: { kind: request.profile.processKind, screeningMethod: 'am' },
    output: { dpi: canvas.dpi, lpi: commonFrequency },
    input: {
      width: request.input.width,
      height: request.input.height,
      ppi: request.input.ppi,
      bitDepth: request.input.bitDepth,
      layout: request.input.layout,
      iccId: request.input.icc ?? null,
      sourceKind: request.input.sourceKind ?? 'continuous-tone',
      samplesPerScreenLine: commonFrequency === null ? null : request.input.ppi / commonFrequency,
      minimumCellPixels: request.profile.minimumCellPixels ?? null,
    },
    canvas: {
      width: canvas.width,
      height: canvas.height,
      roundingRule: canvas.roundingRule,
      suppliedPpi: canvas.ppi,
      suppliedDpi: canvas.dpi,
      physicalWidth: canvas.physicalWidth,
      physicalHeight: canvas.physicalHeight,
    },
    lattice: {
      referenceChannelId,
      resolution: referenceLattice.resolution,
      lpi: referenceLattice.lpi,
      angle: referenceLattice.angle,
      pitch: referenceLattice.pitch,
      origin: referenceLattice.origin,
      phase: referenceLattice.phase,
      basis: { u: referenceLattice.u, v: referenceLattice.v },
      angularConvention: '9-oclock-clockwise',
      pixelCentreConvention: 'centre-at-half-integer',
      boundaryPolicy: 'edge-clamp-with-clipped-flag',
    },
    separation: captured.snapshot,
    channels: snapshotChannels,
    overrides: {
      preparedArtwork: request.input.preparedArtworkOverride?.acknowledged
        ? {
            acknowledged: true,
            reason: request.input.preparedArtworkOverride.reason,
          }
        : null,
    },
    preview: { enabled: false, resolution: null },
  };

  const snapshot: ResultSnapshot = sealSnapshot(unsealed);
  const status = resolveOutcomeStatus(issues);

  if (status === 'rejected') {
    return { status: 'rejected', issues };
  }

  const completed: CompletedResult = {
    status: 'completed',
    rasters,
    channels,
    snapshot,
    issues,
    channelOrder,
  };
  return completed;
}
