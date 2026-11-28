import { describe, expect, it } from 'vitest';
import { channel, validProfile } from '../../../helpers/profileFixtures';
import {
  createFileProfileRepository,
  createInMemoryProfileRepository,
  type ProfileFileSystem,
} from '../../../../src/modules/halftone-studio/profiles/persistence';

function fakeFileSystem(seed: Record<string, string> = {}): ProfileFileSystem & {
  files: Map<string, string>;
} {
  const files = new Map(Object.entries(seed));
  return {
    files,
    read: async (name) => files.get(name) ?? null,
    write: async (name, content) => {
      files.set(name, content);
    },
    list: async () => [...files.keys()].sort(),
    remove: async (name) => {
      files.delete(name);
    },
  };
}

describe('in-memory profile repository', () => {
  it('creates, reads and lists a profile', async () => {
    const repo = createInMemoryProfileRepository();
    expect((await repo.create(validProfile())).ok).toBe(true);

    const got = await repo.get('screen-print-cmyk');
    expect(got.ok).toBe(true);

    const listing = await repo.list();
    expect(listing.documents.map((document) => document.id)).toEqual(['screen-print-cmyk']);
    expect(listing.problems).toEqual([]);
  });

  it('rejects a conflicting id without overwriting', async () => {
    const repo = createInMemoryProfileRepository();
    await repo.create(validProfile());
    const second = await repo.create(
      validProfile({ metadata: { ...validProfile().metadata, name: 'Other' } }),
    );
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe('conflict');

    const got = await repo.get('screen-print-cmyk');
    if (got.ok) expect(got.value.metadata.name).toBe('CMYK 55 LPI');
  });

  it('rejects an invalid profile', async () => {
    const repo = createInMemoryProfileRepository();
    const result = await repo.create(
      validProfile({
        channels: [
          channel({ id: 'dup', inkName: 'black' }),
          channel({ id: 'dup', inkName: 'black' }),
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid');
  });

  it('updates an existing profile', async () => {
    const repo = createInMemoryProfileRepository();
    await repo.create(validProfile());

    const updated = await repo.update(
      validProfile({
        metadata: {
          ...validProfile().metadata,
          name: 'Renamed',
          updatedAt: '2026-02-01T00:00:00.000Z',
        },
      }),
    );
    expect(updated.ok).toBe(true);

    const got = await repo.get('screen-print-cmyk');
    if (got.ok) expect(got.value.metadata.name).toBe('Renamed');
  });

  it('reports not_found for a missing profile on update', async () => {
    const repo = createInMemoryProfileRepository();
    const result = await repo.update(validProfile());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('not_found');
  });

  it('duplicates a profile with a new identity and clock timestamps', async () => {
    const stamp = '2030-01-01T00:00:00.000Z';
    const repo = createInMemoryProfileRepository({ clock: () => stamp });
    await repo.create(validProfile());

    const copy = await repo.duplicate('screen-print-cmyk', { id: 'copy', name: 'Copy' });
    expect(copy.ok).toBe(true);
    if (copy.ok) {
      expect(copy.value.id).toBe('copy');
      expect(copy.value.metadata.name).toBe('Copy');
      expect(copy.value.metadata.createdAt).toBe(stamp);
      expect(copy.value.metadata.updatedAt).toBe(stamp);
    }
  });

  it('removes a profile and reports a missing one', async () => {
    const repo = createInMemoryProfileRepository();
    await repo.create(validProfile());
    expect((await repo.remove('screen-print-cmyk')).ok).toBe(true);
    expect((await repo.get('screen-print-cmyk')).ok).toBe(false);

    const missing = await repo.remove('screen-print-cmyk');
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.code).toBe('not_found');
  });

  it('rejects an unsafe id on get and remove', async () => {
    const repo = createInMemoryProfileRepository();
    const got = await repo.get('../escape');
    expect(got.ok).toBe(false);
    if (!got.ok) expect(got.error.code).toBe('invalid');

    const removed = await repo.remove('../escape');
    expect(removed.ok).toBe(false);
    if (!removed.ok) expect(removed.error.code).toBe('invalid');
  });
});

describe('file-backed profile repository', () => {
  it('reports corrupt files in the listing instead of hiding them', async () => {
    const fileSystem = fakeFileSystem({ 'broken.json': '{' });
    const repo = createFileProfileRepository(fileSystem);

    const listing = await repo.list();
    expect(listing.documents).toEqual([]);
    expect(listing.problems.map((problem) => problem.id)).toEqual(['broken']);
  });

  it('reports corruption on get', async () => {
    const fileSystem = fakeFileSystem({ 'broken.json': '{' });
    const repo = createFileProfileRepository(fileSystem);
    const result = await repo.get('broken');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('corrupt');
  });

  it('lists profiles by id in a stable order', async () => {
    const repo = createFileProfileRepository(fakeFileSystem());
    await repo.create(validProfile({ id: 'zeta' }));
    await repo.create(validProfile({ id: 'alpha' }));

    const listing = await repo.list();
    expect(listing.documents.map((document) => document.id)).toEqual(['alpha', 'zeta']);
  });
});
