// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { DECLARED_FIXTURES, fixtureById } from './fixtures';
import {
  buildBaselineDocument,
  measureFixture,
  toBaselineEntry,
  unavailableEntry,
  writeBaseline,
  type BaselineFixtureEntry,
} from './harness';

/**
 * Manual baseline capture. It is skipped in the default suite so `npm test`
 * stays bounded and the committed baseline does not change on every run.
 *
 * Run it with:
 *
 *   CAPTURE_BASELINE=1 npx vitest run tests/performance/capture-baseline.test.ts
 *
 * Recorded fixtures were measured on the declared reference environment.
 * Unavailable fixtures are recorded with the measured or structural reason they
 * cannot run there; their numbers are never extrapolated.
 */
const CAPTURE = process.env.CAPTURE_BASELINE === '1';

const RECORDED_IDS: readonly string[] = [
  '1mp-1ch-8bit',
  '1mp-1ch-16bit',
  '1mp-4ch-8bit',
  '1mp-4ch-16bit',
  '1mp-8ch-8bit',
  '1mp-8ch-16bit',
  '4mp-1ch-8bit',
  '4mp-1ch-16bit',
  '4mp-4ch-8bit',
  '16mp-1ch-8bit',
];

const UNAVAILABLE: readonly (readonly [string, string])[] = [
  [
    '4mp-4ch-16bit',
    'Exceeds the 60 s per-fixture capture budget on the reference environment; 4 MP four-channel 8-bit already takes about 50 s.',
  ],
  [
    '4mp-8ch-8bit',
    'Exceeds the 60 s per-fixture capture budget; four-channel 4 MP already takes about 50 s and the eight-channel run adds per-channel planes.',
  ],
  [
    '4mp-8ch-16bit',
    'Measured once at about 159 s on the reference environment, above the capture budget; the host is memory constrained, so it is recorded as unavailable rather than extrapolated.',
  ],
  [
    '16mp-1ch-16bit',
    'Exceeds the capture budget on the reference environment; the 16 MP stage workspace plus process overhead approaches the available RAM and the host is already swapping.',
  ],
  [
    '16mp-4ch-8bit',
    'Exceeds the capture budget; extrapolated from the per-channel scaling of the measured fixtures.',
  ],
  [
    '16mp-4ch-16bit',
    'Exceeds the capture budget; extrapolated from the per-channel scaling of the measured fixtures.',
  ],
  [
    '16mp-8ch-8bit',
    'Not viable on the reference environment: about 2.7 GB RAM available with active swap and an eight-channel 16 MP workspace far above that.',
  ],
  [
    '16mp-8ch-16bit',
    'Not viable on the reference environment: about 2.7 GB RAM available with active swap and an eight-channel 16 MP workspace far above that.',
  ],
];

describe.skipIf(!CAPTURE)('performance baseline capture', () => {
  it(
    'measures the recorded fixtures and writes the baseline document',
    { timeout: 900_000 },
    () => {
      const entries: BaselineFixtureEntry[] = [];

      for (const id of RECORDED_IDS) {
        const spec = fixtureById(id);
        const measurement = measureFixture(spec, { iterations: 1 });
        expect(measurement.status).toBe('completed');
        entries.push(toBaselineEntry(measurement));
        // eslint-disable-next-line no-console
        console.log(
          JSON.stringify({
            captured: id,
            medianMs: Math.round(measurement.medianMs),
            peakAdditionalBytes: measurement.peakAdditionalBytes,
            maxRssBytes: measurement.maxRssBytes,
          }),
        );
      }

      for (const [id, reason] of UNAVAILABLE) entries.push(unavailableEntry(id, reason));

      const order = new Map(DECLARED_FIXTURES.map((spec, index) => [spec.id, index]));
      entries.sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0));

      writeBaseline(buildBaselineDocument(entries));
    },
  );
});
