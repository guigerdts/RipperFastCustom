import {
  CAPABILITY_IDS,
  HALFTONE_FLOW_REQUIREMENTS,
  type CapabilityId,
  type CapabilityReport,
  type CapabilityState,
  type PhotoshopCapabilities,
} from '../capability';
import { hasMember, isFunction, isObject, readFiniteNumber } from '../featureDetect';

interface CapabilityEntry {
  readonly state: CapabilityState;
  readonly reason: string | null;
}

function entry(state: CapabilityState, reason: string | null = null): CapabilityEntry {
  return { state, reason };
}

/** Reads `core.apiVersion` defensively; an absent or unreadable value is null. */
function readCoreApiVersion(core: unknown): number | null {
  if (!hasMember(core, 'apiVersion')) return null;
  try {
    return readFiniteNumber((core as Record<string, unknown>)['apiVersion']);
  } catch {
    return null;
  }
}

/**
 * Feature-detects the host surface instead of sniffing host versions: a member
 * that is absent is reported as unavailable and is never called.
 *
 * Document-level members can only be inspected when a document is open, so
 * they are reported as `unknown` in that case rather than guessed.
 */
export function detectCapabilities(
  hostModule: unknown,
  activeDocument: unknown,
): PhotoshopCapabilities {
  const app = isObject(hostModule) ? hostModule['app'] : undefined;
  const core = isObject(hostModule) ? hostModule['core'] : undefined;
  const imaging = isObject(hostModule) ? hostModule['imaging'] : undefined;

  const states = new Map<CapabilityId, CapabilityEntry>();

  const set = (id: CapabilityId, value: CapabilityEntry): void => {
    states.set(id, value);
  };

  const moduleLoaded = hostModule !== null && hostModule !== undefined;
  set(
    'photoshop.module',
    moduleLoaded ? entry('available') : entry('unavailable', 'module_not_loaded'),
  );

  if (!moduleLoaded || !isObject(app)) {
    set(
      'photoshop.app',
      entry('unavailable', moduleLoaded ? 'app_member_missing' : 'module_not_loaded'),
    );
    for (const id of CAPABILITY_IDS) {
      if (!states.has(id)) set(id, entry('unavailable', 'dependency_unavailable'));
    }
    return buildCapabilities(states, null);
  }

  set('photoshop.app', entry('available'));
  set(
    'photoshop.app.activeDocument',
    hasMember(app, 'activeDocument') ? entry('available') : entry('unavailable', 'member_missing'),
  );
  set(
    'photoshop.app.documents',
    hasMember(app, 'documents') ? entry('available') : entry('unavailable', 'member_missing'),
  );
  set(
    'photoshop.app.createDocument',
    isFunction(app['createDocument']) ? entry('available') : entry('unavailable', 'member_missing'),
  );

  // `core.apiVersion` appeared with the modal era (22.5). Its presence is the
  // signal, and the value it reports is what the dashboard shows.
  const observedApiVersion = readCoreApiVersion(core);
  set(
    'photoshop.core.apiVersion',
    observedApiVersion !== null
      ? entry('available')
      : entry('unavailable', isObject(core) ? 'member_missing' : 'core_missing'),
  );
  set(
    'photoshop.core.executeAsModal',
    isObject(core) && isFunction(core['executeAsModal'])
      ? entry('available')
      : entry('unavailable', isObject(core) ? 'member_missing' : 'core_missing'),
  );

  // The Imaging API is a sub-module: detect the module and each member the flow
  // actually calls, so a partial surface is reported as partial.
  const imagingEntry = (holds: boolean): CapabilityEntry =>
    holds
      ? entry('available')
      : entry('unavailable', isObject(imaging) ? 'member_missing' : 'imaging_missing');

  set('photoshop.imaging', imagingEntry(isObject(imaging)));
  set(
    'photoshop.imaging.getPixels',
    imagingEntry(isObject(imaging) && isFunction(imaging['getPixels'])),
  );
  set(
    'photoshop.imaging.putPixels',
    imagingEntry(isObject(imaging) && isFunction(imaging['putPixels'])),
  );

  const documentIds: CapabilityId[] = [
    'photoshop.document.id',
    'photoshop.document.name',
    'photoshop.document.width',
    'photoshop.document.height',
    'photoshop.document.resolution',
    'photoshop.document.mode',
    'photoshop.document.bitsPerChannel',
    'photoshop.document.layers',
    'photoshop.document.createLayer',
    'photoshop.layerCollection.length',
  ];

  if (!isObject(activeDocument)) {
    for (const id of documentIds) set(id, entry('unknown', 'no_active_document'));
    return buildCapabilities(states, observedApiVersion);
  }

  const layers = activeDocument['layers'];

  for (const id of documentIds) {
    if (id === 'photoshop.layerCollection.length') {
      set(
        id,
        hasMember(layers, 'length') ? entry('available') : entry('unavailable', 'member_missing'),
      );
      continue;
    }
    if (id === 'photoshop.document.createLayer') {
      set(
        id,
        isFunction(activeDocument['createLayer'])
          ? entry('available')
          : entry('unavailable', 'member_missing'),
      );
      continue;
    }
    const key = id.split('.').pop() ?? '';
    set(
      id,
      hasMember(activeDocument, key) ? entry('available') : entry('unavailable', 'member_missing'),
    );
  }

  return buildCapabilities(states, observedApiVersion);
}

function buildCapabilities(
  states: Map<CapabilityId, CapabilityEntry>,
  apiVersion: number | null,
): PhotoshopCapabilities {
  const snapshot = new Map<CapabilityId, CapabilityEntry>(states);
  const read = (id: CapabilityId): CapabilityEntry =>
    snapshot.get(id) ?? entry('unknown', 'not_detected');

  const halftoneFlowBlockers = (): readonly CapabilityId[] =>
    HALFTONE_FLOW_REQUIREMENTS.filter((id) => read(id).state !== 'available');

  return {
    apiVersion,
    getState: (id) => read(id).state,
    getReason: (id) => read(id).reason,
    isAvailable: (id) => read(id).state === 'available',
    report: (): readonly CapabilityReport[] =>
      CAPABILITY_IDS.map((id) => ({ id, state: read(id).state, reason: read(id).reason })),
    isHalftoneFlowReady: () => halftoneFlowBlockers().length === 0,
    halftoneFlowBlockers,
  };
}
