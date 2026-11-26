/**
 * Key/value storage scoped to the running plugin session.
 *
 * v0.1.0 deliberately stays in memory: persisting to disk would require a
 * `localFileSystem` manifest permission that no current feature needs.
 */
export interface StorageService {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export function createInMemoryStorage(): StorageService {
  const values = new Map<string, string>();
  return {
    get: (key) => values.get(key) ?? null,
    set: (key, value) => {
      values.set(key, value);
    },
    remove: (key) => {
      values.delete(key);
    },
  };
}
