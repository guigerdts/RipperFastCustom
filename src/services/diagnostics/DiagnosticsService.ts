export type DiagnosticLevel = 'info' | 'warn' | 'error';

export interface DiagnosticEntry {
  readonly level: DiagnosticLevel;
  readonly code: string;
  readonly message: string;
}

/**
 * Append-only runtime log shown in diagnostics screens. Entries are structured
 * (code + message) so they stay translatable and testable.
 */
export interface DiagnosticsService {
  record(level: DiagnosticLevel, code: string, message?: string): void;
  entries(): readonly DiagnosticEntry[];
  hasErrors(): boolean;
  clear(): void;
}

export function createDiagnostics(): DiagnosticsService {
  const log: DiagnosticEntry[] = [];
  return {
    record(level, code, message = '') {
      log.push({ level, code, message });
    },
    entries: () => log.slice(),
    hasErrors: () => log.some((entry) => entry.level === 'error'),
    clear: () => {
      log.length = 0;
    },
  };
}
