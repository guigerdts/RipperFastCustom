import { DECLARED_API_VERSION } from '../../constants/app';
import {
  CAPABILITY_IDS,
  type CapabilityId,
  type CapabilityReport,
  type CapabilityState,
  type PhotoshopCapabilities,
} from '../capability';
import { hasMember, isFunction, isObject } from '../featureDetect';

interface CapabilityEntry {
  readonly state: CapabilityState;
  readonly reason: string | null;
}

function entry(state: CapabilityState, reason: string | null = null): CapabilityEntry {
  return { state, reason };
}

/**
 * Feature-detects the API v1 surface instead of sniffing host versions: a
 * member that is absent is reported as unavailable and is never called.
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
    return buildCapabilities(states);
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
    'photoshop.core.executeAsModal',
    isObject(core) && isFunction(core['executeAsModal'])
      ? entry('available')
      : entry('unavailable', 'member_missing'),
  );

  const documentIds: CapabilityId[] = [
    'photoshop.document.name',
    'photoshop.document.width',
    'photoshop.document.height',
    'photoshop.document.resolution',
    'photoshop.document.layers',
    'photoshop.layerCollection.length',
  ];

  if (!isObject(activeDocument)) {
    for (const id of documentIds) set(id, entry('unknown', 'no_active_document'));
    return buildCapabilities(states);
  }

  const layers = activeDocument['layers'];

  for (const id of documentIds) {
    const member = id === 'photoshop.layerCollection.length' ? layers : activeDocument;
    const key = id === 'photoshop.layerCollection.length' ? 'length' : (id.split('.').pop() ?? '');
    set(id, hasMember(member, key) ? entry('available') : entry('unavailable', 'member_missing'));
  }

  return buildCapabilities(states);
}

function buildCapabilities(states: Map<CapabilityId, CapabilityEntry>): PhotoshopCapabilities {
  const snapshot = new Map<CapabilityId, CapabilityEntry>(states);
  const read = (id: CapabilityId): CapabilityEntry =>
    snapshot.get(id) ?? entry('unknown', 'not_detected');

  return {
    apiVersion: DECLARED_API_VERSION,
    getState: (id) => read(id).state,
    getReason: (id) => read(id).reason,
    isAvailable: (id) => read(id).state === 'available',
    report: (): readonly CapabilityReport[] =>
      CAPABILITY_IDS.map((id) => ({ id, state: read(id).state, reason: read(id).reason })),
  };
}
