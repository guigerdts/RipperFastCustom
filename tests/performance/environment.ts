/**
 * Runtime environment recorded with every baseline. The wall-clock numbers are
 * only meaningful on the fingerprint recorded here; later comparisons use the
 * relative regression threshold instead.
 */

import { cpus, freemem, loadavg, totalmem } from 'node:os';

export interface BenchmarkEnvironment {
  readonly node: string;
  readonly platform: string;
  readonly arch: string;
  readonly cpuModel: string;
  readonly cpuCount: number;
  readonly totalMemoryBytes: number;
  readonly freeMemoryBytes: number;
  readonly loadAverage: readonly number[];
  readonly note: string;
}

const ENVIRONMENT_NOTE =
  'Ubuntu on Termux/proot, 8 Cortex-A55 cores, memory constrained (see docs/PERFORMANCE.md).';

export function benchmarkEnvironment(): BenchmarkEnvironment {
  const cpu = cpus()[0];
  return {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpuModel: cpu?.model ?? 'unknown',
    cpuCount: cpus().length,
    totalMemoryBytes: totalmem(),
    freeMemoryBytes: freemem(),
    loadAverage: loadavg(),
    note: ENVIRONMENT_NOTE,
  };
}

export function environmentFingerprint(environment: BenchmarkEnvironment): string {
  return [environment.node, environment.platform, environment.arch, environment.cpuModel].join('|');
}
