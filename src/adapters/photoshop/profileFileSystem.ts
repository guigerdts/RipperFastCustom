/**
 * UXP implementation of the profile-store file port.
 *
 * The profile repository is host-independent; this adapter is the only place
 * that knows UXP even has a file system. It targets the plugin-data folder
 * returned by `storage.localFileSystem.getDataFolder()`, which is the durable,
 * user-invisible location UXP documents for plugin data.
 *
 * Two honest limits, both deliberate:
 *
 * - `getDataFolder()` requires the `localFileSystem` manifest permission. The
 *   current manifests do not declare it (adding a permission is its own ticket),
 *   so on a shipped build this factory returns `null` and the profile UI will
 *   offer no persistence until that permission is added. It never pretends a
 *   store exists.
 * - Every member is feature-detected before it is called. A missing module or
 *   member yields `null`; a failed read yields `null`; nothing throws just
 *   because the host is older.
 */

import type { ModuleLoader } from '../runtime/moduleLoader';
import { loadModuleOrNull } from '../runtime/moduleLoader';
import { isFunction, isObject } from '../featureDetect';
import type { ProfileFileSystem } from '../../modules/halftone-studio/profiles/persistence';

type UnknownRecord = Record<string, unknown>;

function readLocalFileSystem(loader: ModuleLoader): UnknownRecord | null {
  const uxp = loadModuleOrNull(loader, 'uxp');
  if (!isObject(uxp)) return null;

  const storage = uxp['storage'];
  if (!isObject(storage)) return null;

  const localFileSystem = storage['localFileSystem'];
  if (!isObject(localFileSystem)) return null;
  if (!isFunction(localFileSystem['getDataFolder'])) return null;

  return localFileSystem;
}

async function getEntry(folder: UnknownRecord, name: string): Promise<UnknownRecord | null> {
  if (!isFunction(folder['getEntry'])) return null;
  try {
    const entry = await (folder['getEntry'] as (entryName: string) => Promise<unknown>).call(
      folder,
      name,
    );
    return isObject(entry) ? entry : null;
  } catch {
    // `getEntry` rejects when the file does not exist; that is a normal miss.
    return null;
  }
}

/**
 * Builds a `ProfileFileSystem` over the UXP plugin-data folder, or returns
 * `null` when the runtime does not expose one.
 */
export function createUxpProfileFileSystem(loader: ModuleLoader): ProfileFileSystem | null {
  const localFileSystem = readLocalFileSystem(loader);
  if (localFileSystem === null) return null;

  let folderPromise: Promise<UnknownRecord> | null = null;
  const folder = (): Promise<UnknownRecord> => {
    folderPromise ??= Promise.resolve(
      (localFileSystem['getDataFolder'] as () => Promise<unknown>).call(localFileSystem),
    ).then((value) => {
      if (!isObject(value)) throw new Error('profile_store_folder_unavailable');
      return value;
    });
    return folderPromise;
  };

  async function read(name: string): Promise<string | null> {
    const entry = await getEntry(await folder(), name);
    if (entry === null || !isFunction(entry['read'])) return null;
    try {
      const contents = await (entry['read'] as () => Promise<unknown>).call(entry);
      return typeof contents === 'string' ? contents : null;
    } catch {
      return null;
    }
  }

  async function write(name: string, content: string): Promise<void> {
    const target = await folder();
    if (!isFunction(target['createFile'])) throw new Error('profile_store_create_unavailable');
    const entry = await (
      target['createFile'] as (fileName: string, options?: unknown) => Promise<unknown>
    ).call(target, name, { overwrite: true });
    if (!isObject(entry) || !isFunction(entry['write'])) {
      throw new Error('profile_store_write_unavailable');
    }
    await (entry['write'] as (contents: string) => Promise<unknown>).call(entry, content);
  }

  async function list(): Promise<readonly string[]> {
    const target = await folder();
    if (!isFunction(target['getEntries'])) return [];
    const entries = await (target['getEntries'] as () => Promise<unknown>).call(target);
    if (!Array.isArray(entries)) return [];

    const names: string[] = [];
    for (const entry of entries) {
      if (isObject(entry) && typeof entry['name'] === 'string' && entry['name'].endsWith('.json')) {
        names.push(entry['name']);
      }
    }
    return names.sort();
  }

  async function remove(name: string): Promise<void> {
    const entry = await getEntry(await folder(), name);
    if (entry !== null && isFunction(entry['delete'])) {
      await (entry['delete'] as () => Promise<unknown>).call(entry);
    }
  }

  return { read, write, list, remove };
}
