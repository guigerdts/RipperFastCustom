/**
 * Profile persistence behind an injectable port.
 *
 * Storage is split in three pieces so each can be replaced and tested:
 *
 * 1. `ProfileFileSystem` — the smallest file surface the repository needs
 *    (read, write, list, remove by name). The module layer stays host-free; a
 *    UXP implementation lives in `src/adapters/`.
 * 2. `createRepository` — the storage-format-aware repository: one JSON file per
 *    profile, validated on write, parsed and migrated on read.
 * 3. `createInMemoryProfileRepository` / `createFileProfileRepository` — the two
 *    concrete entry points. Tests use the in-memory one; the app uses the file
 *    one over the real file system.
 *
 * Every operation returns a discriminated result instead of throwing, so the UI
 * can present a specific message. Nothing is silently overwritten or lost: a
 * conflict, a missing profile, an invalid profile and a corrupt file are distinct
 * outcomes.
 */

import type { ProductionProfileDocument } from './model';
import { isSafeProfileId } from './model';
import type { ProfileIssue } from './diagnostics';
import { createProfileIssue, hasProfileErrors } from './diagnostics';
import { parseProfileJson } from './parse';
import { serializeProfileDocument } from './serialization';
import { validateProfileDocument } from './validation';

/** The file surface the repository needs. Names are flat, no directories. */
export interface ProfileFileSystem {
  read(name: string): Promise<string | null>;
  write(name: string, content: string): Promise<void>;
  list(): Promise<readonly string[]>;
  remove(name: string): Promise<void>;
}

export type ProfileStoreError =
  | { readonly code: 'not_found'; readonly id: string }
  | { readonly code: 'conflict'; readonly id: string }
  | { readonly code: 'invalid'; readonly id: string; readonly issues: readonly ProfileIssue[] }
  | { readonly code: 'corrupt'; readonly id: string; readonly issues: readonly ProfileIssue[] };

export type ProfileStoreResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ProfileStoreError };

/** A stored file that could not be read back as a profile. */
export interface ProfileStoreProblem {
  readonly id: string;
  readonly issues: readonly ProfileIssue[];
}

export interface ProfileListing {
  readonly documents: readonly ProductionProfileDocument[];
  readonly problems: readonly ProfileStoreProblem[];
}

export interface ProfileRepository {
  list(): Promise<ProfileListing>;
  get(id: string): Promise<ProfileStoreResult<ProductionProfileDocument>>;
  create(
    document: ProductionProfileDocument,
  ): Promise<ProfileStoreResult<ProductionProfileDocument>>;
  update(
    document: ProductionProfileDocument,
  ): Promise<ProfileStoreResult<ProductionProfileDocument>>;
  duplicate(
    id: string,
    copy: { readonly id: string; readonly name: string },
  ): Promise<ProfileStoreResult<ProductionProfileDocument>>;
  remove(id: string): Promise<ProfileStoreResult<void>>;
}

export type ProfileClock = () => string;

const defaultClock: ProfileClock = () => new Date().toISOString();

const SUFFIX = '.json';

function fileFor(id: string): string {
  return `${id}${SUFFIX}`;
}

function idFromFile(name: string): string | null {
  return name.endsWith(SUFFIX) ? name.slice(0, -SUFFIX.length) : null;
}

function invalidId(id: string): ProfileStoreResult<never> {
  return {
    ok: false,
    error: {
      code: 'invalid',
      id,
      issues: [
        createProfileIssue(
          'profile.id_invalid',
          'The profile id is not a valid, storage-safe identity.',
          'id',
          { value: id },
        ),
      ],
    },
  };
}

/**
 * Builds the repository over a file system. `clock` is injected so tests can
 * produce deterministic `createdAt`/`updatedAt` values when duplicating.
 */
export function createRepository(
  fileSystem: ProfileFileSystem,
  clock: ProfileClock = defaultClock,
): ProfileRepository {
  async function readFile(id: string): Promise<string | null> {
    return fileSystem.read(fileFor(id));
  }

  async function get(id: string): Promise<ProfileStoreResult<ProductionProfileDocument>> {
    if (!isSafeProfileId(id)) return invalidId(id);

    const raw = await readFile(id);
    if (raw === null) return { ok: false, error: { code: 'not_found', id } };

    const parsed = parseProfileJson(raw);
    if (!parsed.ok) return { ok: false, error: { code: 'corrupt', id, issues: parsed.issues } };
    return { ok: true, value: parsed.document };
  }

  function checkUsable(
    document: ProductionProfileDocument,
  ): ProfileStoreResult<ProductionProfileDocument> | null {
    const issues = validateProfileDocument(document);
    if (hasProfileErrors(issues)) {
      return { ok: false, error: { code: 'invalid', id: document.id, issues } };
    }
    return null;
  }

  async function create(
    document: ProductionProfileDocument,
  ): Promise<ProfileStoreResult<ProductionProfileDocument>> {
    const invalid = checkUsable(document);
    if (invalid !== null) return invalid;

    if ((await readFile(document.id)) !== null) {
      return { ok: false, error: { code: 'conflict', id: document.id } };
    }

    await fileSystem.write(fileFor(document.id), serializeProfileDocument(document));
    return { ok: true, value: document };
  }

  async function update(
    document: ProductionProfileDocument,
  ): Promise<ProfileStoreResult<ProductionProfileDocument>> {
    const invalid = checkUsable(document);
    if (invalid !== null) return invalid;

    if ((await readFile(document.id)) === null) {
      return { ok: false, error: { code: 'not_found', id: document.id } };
    }

    await fileSystem.write(fileFor(document.id), serializeProfileDocument(document));
    return { ok: true, value: document };
  }

  async function duplicate(
    id: string,
    copy: { readonly id: string; readonly name: string },
  ): Promise<ProfileStoreResult<ProductionProfileDocument>> {
    const source = await get(id);
    if (!source.ok) return source;

    const now = clock();
    const duplicateDocument: ProductionProfileDocument = {
      ...source.value,
      id: copy.id,
      metadata: {
        ...source.value.metadata,
        name: copy.name,
        createdAt: now,
        updatedAt: now,
      },
    };
    return create(duplicateDocument);
  }

  async function remove(id: string): Promise<ProfileStoreResult<void>> {
    if (!isSafeProfileId(id)) return invalidId(id);
    if ((await readFile(id)) === null) return { ok: false, error: { code: 'not_found', id } };

    await fileSystem.remove(fileFor(id));
    return { ok: true, value: undefined };
  }

  async function list(): Promise<ProfileListing> {
    const documents: ProductionProfileDocument[] = [];
    const problems: ProfileStoreProblem[] = [];

    for (const name of await fileSystem.list()) {
      const id = idFromFile(name);
      if (id === null) continue;

      const raw = await fileSystem.read(name);
      if (raw === null) continue;

      const parsed = parseProfileJson(raw);
      if (parsed.ok) documents.push(parsed.document);
      else problems.push({ id, issues: parsed.issues });
    }

    documents.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    problems.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return { documents, problems };
  }

  return { list, get, create, update, duplicate, remove };
}

/** A repository over process memory, for tests and preview runs. */
export function createInMemoryProfileRepository(
  options: { readonly clock?: ProfileClock } = {},
): ProfileRepository {
  const files = new Map<string, string>();
  const fileSystem: ProfileFileSystem = {
    read: async (name) => files.get(name) ?? null,
    write: async (name, content) => {
      files.set(name, content);
    },
    list: async () => [...files.keys()].sort(),
    remove: async (name) => {
      files.delete(name);
    },
  };
  return createRepository(fileSystem, options.clock ?? defaultClock);
}

/** A repository over an arbitrary file system (in production, the UXP one). */
export function createFileProfileRepository(
  fileSystem: ProfileFileSystem,
  options: { readonly clock?: ProfileClock } = {},
): ProfileRepository {
  return createRepository(fileSystem, options.clock ?? defaultClock);
}
