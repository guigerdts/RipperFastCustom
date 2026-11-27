import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC_DIR = path.resolve(process.cwd(), 'src');

/** Files allowed to reference host modules directly. */
const ALLOWED = ['adapters/', 'types/host.d.ts'];

const HOST_IMPORT =
  /(require\(\s*['"](photoshop|uxp)['"]\s*\))|((?:from|import)\s*['"](photoshop|uxp)['"])/;

/**
 * Engine modules stay pure: no host, no DOM, no I/O, no ambient storage, no
 * network and no wall-clock or randomness source. Named here so the boundary
 * is enforced instead of assumed.
 */
const FORBIDDEN_ENGINE_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  [
    'host or DOM global',
    /\b(?:window|document|navigator|localStorage|sessionStorage|indexedDB|XMLHttpRequest|WebSocket)\s*\./,
  ],
  ['network access', /\bfetch\s*\(/],
  ['dynamic module loading', /\b(?:require|import)\s*\(/],
  ['ambient process access', /\bprocess\s*\./],
  ['wall clock', /\bDate\s*\.\s*(?:now|parse)\b|\bnew\s+Date\b|\bperformance\s*\.\s*now\b/],
  ['randomness', /\bMath\s*\.\s*random\b/],
  ['timers', /\b(?:setTimeout|setInterval|setImmediate|queueMicrotask)\s*\(/],
];

const IMPORT_PATTERN =
  /\bfrom\s+['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s+['"]([^'"]+)['"]/gm;

/**
 * Value imports only, for the runtime cycle check. `import type` and
 * `export type` are erased by the compiler, so a type-only back-reference is
 * not a runtime cycle.
 */
const VALUE_IMPORT_PATTERN =
  /\b(?:import|export)\s+(?!type\b)(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]|\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s+['"]([^'"]+)['"]/gm;

function listSourceFiles(): string[] {
  return (readdirSync(SRC_DIR, { recursive: true }) as string[])
    .filter((file) => file.endsWith('.ts'))
    .map((file) => file.split(path.sep).join('/'))
    .sort();
}

function isAllowed(file: string): boolean {
  return ALLOWED.some((allowed) => file.startsWith(allowed) || file === allowed);
}

/** Every module specifier a source file imports, in source order. */
function importSpecifiers(absolute: string): string[] {
  const source = readFileSync(absolute, 'utf8');
  const specifiers: string[] = [];
  for (const match of source.matchAll(IMPORT_PATTERN)) {
    const specifier = match[1] ?? match[2] ?? match[3] ?? match[4];
    if (specifier !== undefined) specifiers.push(specifier);
  }
  return specifiers;
}

/** Value imports only, in source order. */
function valueImportSpecifiers(absolute: string): string[] {
  const source = readFileSync(absolute, 'utf8');
  const specifiers: string[] = [];
  for (const match of source.matchAll(VALUE_IMPORT_PATTERN)) {
    const specifier = match[1] ?? match[2] ?? match[3];
    if (specifier !== undefined) specifiers.push(specifier);
  }
  return specifiers;
}

/** Resolves a relative import to an existing TypeScript file, or null. */
function resolveImport(from: string, specifier: string): string | null {
  const base = path.resolve(path.dirname(from), specifier);
  for (const candidate of [`${base}.ts`, path.join(base, 'index.ts')]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function relativeToSrc(absolute: string): string {
  return path.relative(SRC_DIR, absolute).split(path.sep).join('/');
}

describe('architecture boundary', () => {
  const files = listSourceFiles();
  const engineFiles = files.filter((file) => file.startsWith('engines/'));

  it('scans a non-trivial source tree', () => {
    expect(files.length).toBeGreaterThan(20);
    expect(engineFiles.length).toBeGreaterThan(10);
  });

  it('keeps every host module reference inside the adapter layer', () => {
    const offenders = files.filter((file) => {
      if (isAllowed(file)) return false;
      return HOST_IMPORT.test(readFileSync(path.join(SRC_DIR, file), 'utf8'));
    });

    expect(offenders).toEqual([]);
  });

  it('imports nothing but relative modules outside the adapter layer', () => {
    const offenders: string[] = [];

    for (const file of files) {
      const allowedHostReference = isAllowed(file);
      for (const specifier of importSpecifiers(path.join(SRC_DIR, file))) {
        if (specifier.startsWith('.')) continue;
        const hostModule = specifier === 'photoshop' || specifier === 'uxp';
        if (allowedHostReference && hostModule) continue;
        offenders.push(`${file} -> ${specifier}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('keeps the engine free of host, DOM, I/O, storage and randomness', () => {
    const offenders: string[] = [];

    for (const file of engineFiles) {
      const source = readFileSync(path.join(SRC_DIR, file), 'utf8');
      for (const [label, pattern] of FORBIDDEN_ENGINE_PATTERNS) {
        if (pattern.test(source)) offenders.push(`${file}: ${label}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('keeps every engine import inside the engine', () => {
    const offenders: string[] = [];

    for (const file of engineFiles) {
      const absolute = path.join(SRC_DIR, file);
      for (const specifier of importSpecifiers(absolute)) {
        if (!specifier.startsWith('.')) continue;
        const resolved = resolveImport(absolute, specifier);
        if (resolved === null) {
          offenders.push(`${file} -> ${specifier} (unresolved)`);
          continue;
        }
        const relative = relativeToSrc(resolved);
        if (relative !== 'engines' && !relative.startsWith('engines/')) {
          offenders.push(`${file} -> ${relative}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('has no circular imports in the source graph', () => {
    const graph = new Map<string, string[]>();
    for (const file of files) {
      const absolute = path.join(SRC_DIR, file);
      const dependencies: string[] = [];
      for (const specifier of valueImportSpecifiers(absolute)) {
        if (!specifier.startsWith('.')) continue;
        const resolved = resolveImport(absolute, specifier);
        if (resolved !== null) dependencies.push(resolved);
      }
      graph.set(absolute, dependencies);
    }

    const state = new Map<string, 'visiting' | 'done'>();
    const stack: string[] = [];
    const cycles: string[][] = [];

    const visit = (file: string): void => {
      const current = state.get(file);
      if (current === 'done') return;
      if (current === 'visiting') {
        const start = stack.indexOf(file);
        cycles.push([...stack.slice(start), file].map(relativeToSrc));
        return;
      }
      state.set(file, 'visiting');
      stack.push(file);
      for (const dependency of graph.get(file) ?? []) visit(dependency);
      stack.pop();
      state.set(file, 'done');
    };

    for (const file of files) visit(path.join(SRC_DIR, file));

    expect(cycles).toEqual([]);
  });
});
