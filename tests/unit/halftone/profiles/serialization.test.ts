import { describe, expect, it } from 'vitest';
import { validProfile } from '../../../helpers/profileFixtures';
import { serializeProfileDocument } from '../../../../src/modules/halftone-studio/profiles/serialization';
import {
  parseProfileDocument,
  parseProfileJson,
} from '../../../../src/modules/halftone-studio/profiles/parse';

describe('profile serialization', () => {
  it('round-trips a document without loss', () => {
    const document = validProfile();
    const parsed = parseProfileJson(serializeProfileDocument(document));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.document).toEqual(document);
  });

  it('preserves a null allowed-resolutions list', () => {
    const document = validProfile({ output: { dpi: 1200, allowedResolutions: null } });
    const parsed = parseProfileDocument(JSON.parse(serializeProfileDocument(document)));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.document.output.allowedResolutions).toBeNull();
  });

  it('serializes deterministically with a stable key order', () => {
    const document = validProfile();
    const first = serializeProfileDocument(document);
    const second = serializeProfileDocument(document);
    expect(second).toBe(first);
    expect(first.indexOf('"schemaVersion"')).toBeLessThan(first.indexOf('"id"'));
    expect(first.indexOf('"metadata"')).toBeLessThan(first.indexOf('"output"'));
  });

  it('writes a channel-preserving separation and a linear-mixing one distinctly', () => {
    const preserving = serializeProfileDocument(validProfile());
    expect(preserving).toContain('"mode": "channel-preserving"');
    expect(preserving).toContain('"channelMap"');

    const mixing = serializeProfileDocument(
      validProfile({
        separation: {
          mode: 'linear-mixing',
          matrix: [
            [1, 0, 0],
            [0, 1, 0],
            [0, 0, 1],
            [0, 0, 0],
          ],
        },
      }),
    );
    expect(mixing).toContain('"mode": "linear-mixing"');
    expect(mixing).toContain('"matrix"');
  });
});
