import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC_DIR = path.resolve(process.cwd(), 'src');

/** Files allowed to reference host modules directly. */
const ALLOWED = ['adapters/', 'types/host.d.ts'];

const HOST_IMPORT =
  /(require\(\s*['"](photoshop|uxp)['"]\s*\))|((?:from|import)\s*['"](photoshop|uxp)['"])/;

function listSourceFiles(): string[] {
  return (readdirSync(SRC_DIR, { recursive: true }) as string[])
    .filter((file) => file.endsWith('.ts'))
    .map((file) => file.split(path.sep).join('/'))
    .sort();
}

describe('architecture boundary', () => {
  const files = listSourceFiles();

  it('scans a non-trivial source tree', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('keeps every host module reference inside the adapter layer', () => {
    const offenders = files.filter((file) => {
      if (ALLOWED.some((allowed) => file.startsWith(allowed) || file === allowed)) return false;
      return HOST_IMPORT.test(readFileSync(path.join(SRC_DIR, file), 'utf8'));
    });
    expect(offenders).toEqual([]);
  });

  it('never lets an engine reach the Photoshop host', () => {
    const engineFiles = files.filter((file) => file.startsWith('engines/'));
    for (const file of engineFiles) {
      const content = readFileSync(path.join(SRC_DIR, file), 'utf8');
      expect(HOST_IMPORT.test(content), file).toBe(false);
    }
  });

  it('keeps UI screens free of host module references', () => {
    const uiFiles = files.filter((file) => file.startsWith('ui/'));
    expect(uiFiles.length).toBeGreaterThan(5);
    for (const file of uiFiles) {
      const content = readFileSync(path.join(SRC_DIR, file), 'utf8');
      expect(HOST_IMPORT.test(content), file).toBe(false);
    }
  });
});
