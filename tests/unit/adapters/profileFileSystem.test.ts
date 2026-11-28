import { describe, expect, it } from 'vitest';
import { createUxpProfileFileSystem } from '../../../src/adapters/photoshop/profileFileSystem';
import type { ModuleLoader } from '../../../src/adapters/runtime/moduleLoader';

function loaderFor(value: unknown): ModuleLoader {
  return () => value;
}

interface FakeEntry {
  readonly name: string;
  content: string;
}

function fakeUxpModule() {
  const files = new Map<string, FakeEntry>();

  const entryFor = (name: string): FakeEntry => {
    const existing = files.get(name);
    if (existing !== undefined) return existing;
    const created: FakeEntry = { name, content: '' };
    files.set(name, created);
    return created;
  };

  const folder = {
    createFile: async (name: string, options?: { overwrite?: boolean }) => {
      if (!options?.overwrite && files.has(name)) throw new Error('exists');
      entryFor(name);
      return {
        name,
        read: async () => entryFor(name).content,
        write: async (contents: string) => {
          entryFor(name).content = contents;
        },
        delete: async () => {
          files.delete(name);
        },
      };
    },
    getEntry: async (name: string) => {
      if (!files.has(name)) throw new Error('not found');
      return {
        name,
        read: async () => entryFor(name).content,
        write: async (contents: string) => {
          entryFor(name).content = contents;
        },
        delete: async () => {
          files.delete(name);
        },
      };
    },
    getEntries: async () => [...files.values()].map((entry) => ({ name: entry.name })),
  };

  return {
    files,
    module: { storage: { localFileSystem: { getDataFolder: async () => folder } } },
  };
}

describe('createUxpProfileFileSystem', () => {
  it('returns null when the uxp module is absent', () => {
    expect(createUxpProfileFileSystem(loaderFor(null))).toBeNull();
  });

  it('returns null when storage or its member is absent', () => {
    expect(createUxpProfileFileSystem(loaderFor({}))).toBeNull();
    expect(createUxpProfileFileSystem(loaderFor({ storage: {} }))).toBeNull();
    expect(createUxpProfileFileSystem(loaderFor({ storage: { localFileSystem: {} } }))).toBeNull();
  });

  it('reads, writes, lists and removes files in the plugin-data folder', async () => {
    const { module } = fakeUxpModule();
    const fileSystem = createUxpProfileFileSystem(loaderFor(module));
    expect(fileSystem).not.toBeNull();
    if (fileSystem === null) return;

    await fileSystem.write('a.json', 'hello');
    expect(await fileSystem.read('a.json')).toBe('hello');
    expect(await fileSystem.list()).toEqual(['a.json']);

    await fileSystem.remove('a.json');
    expect(await fileSystem.read('a.json')).toBeNull();
  });

  it('returns null when reading a missing file', async () => {
    const { module } = fakeUxpModule();
    const fileSystem = createUxpProfileFileSystem(loaderFor(module));
    if (fileSystem === null) throw new Error('expected a file system');

    expect(await fileSystem.read('missing.json')).toBeNull();
  });

  it('lists only profile JSON files', async () => {
    const { module } = fakeUxpModule();
    const fileSystem = createUxpProfileFileSystem(loaderFor(module));
    if (fileSystem === null) throw new Error('expected a file system');

    await fileSystem.write('a.json', '{}');
    await fileSystem.write('b.txt', 'text');
    expect(await fileSystem.list()).toEqual(['a.json']);
  });
});
