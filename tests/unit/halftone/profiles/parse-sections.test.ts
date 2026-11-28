import { describe, expect, it } from 'vitest';
import { channel } from '../../../helpers/profileFixtures';
import {
  readChannels,
  readScreening,
} from '../../../../src/modules/halftone-studio/profiles/parse-channel';
import { readSeparation } from '../../../../src/modules/halftone-studio/profiles/parse-separation';
import type { ProfileIssue } from '../../../../src/modules/halftone-studio/profiles/diagnostics';

function read(reader: (issues: ProfileIssue[]) => unknown): ProfileIssue[] {
  const issues: ProfileIssue[] = [];
  reader(issues);
  return issues;
}

function codes(issues: readonly ProfileIssue[]): string[] {
  return issues.map((issue) => issue.code);
}

function paths(issues: readonly ProfileIssue[]): string[] {
  return issues.map((issue) => issue.path);
}

describe('readChannels', () => {
  it('reads a channel list with its screening values', () => {
    const issues: ProfileIssue[] = [];
    const channels = readChannels([channel()], issues);
    expect(issues).toEqual([]);
    expect(channels).toEqual([
      {
        id: 'k',
        inkName: 'black',
        dataKind: 'tone',
        displayColor: null,
        screening: { lpi: 55, angle: 45, dotShape: 'round' },
      },
    ]);
  });

  it('rejects a missing channel list', () => {
    expect(codes(read((issues) => readChannels(undefined, issues)))).toContain(
      'profile.missing_field',
    );
  });

  it('rejects a channel that is not an object', () => {
    expect(paths(read((issues) => readChannels(['nope'], issues)))).toContain('channels[0]');
  });

  it('reports every wrong-typed field of one channel', () => {
    const issues = read((list) => readChannels([{ id: 1, inkName: 2, screening: null }], list));
    expect(paths(issues)).toEqual(
      expect.arrayContaining([
        'channels[0].id',
        'channels[0].inkName',
        'channels[0].screening',
        'channels[0].dataKind',
      ]),
    );
  });
});

describe('readScreening', () => {
  it('rejects a non-object screening block', () => {
    expect(paths(read((issues) => readScreening(null, 'channels[0].screening', issues)))).toContain(
      'channels[0].screening',
    );
  });

  it('reports a non-numeric LPI and a missing dot shape', () => {
    const issues = read((list) =>
      readScreening({ lpi: '55', angle: 45 }, 'channels[0].screening', list),
    );
    expect(paths(issues)).toEqual(
      expect.arrayContaining(['channels[0].screening.lpi', 'channels[0].screening.dotShape']),
    );
  });
});

describe('readSeparation', () => {
  it('reads a channel-preserving map', () => {
    const issues: ProfileIssue[] = [];
    expect(readSeparation({ mode: 'channel-preserving', channelMap: { c: 'c' } }, issues)).toEqual({
      mode: 'channel-preserving',
      channelMap: { c: 'c' },
    });
    expect(issues).toEqual([]);
  });

  it('reads a linear-mixing matrix', () => {
    const issues: ProfileIssue[] = [];
    expect(readSeparation({ mode: 'linear-mixing', matrix: [[1, 0]] }, issues)).toEqual({
      mode: 'linear-mixing',
      matrix: [[1, 0]],
    });
    expect(issues).toEqual([]);
  });

  it('rejects a non-string channel map value', () => {
    expect(
      paths(
        read((issues) =>
          readSeparation({ mode: 'channel-preserving', channelMap: { c: 1 } }, issues),
        ),
      ),
    ).toContain('separation.channelMap.c');
  });

  it('rejects a matrix with a malformed row', () => {
    expect(
      paths(
        read((issues) => readSeparation({ mode: 'linear-mixing', matrix: [[1], 'x'] }, issues)),
      ),
    ).toContain('separation.matrix');
  });

  it('reports an unsupported mode with its value', () => {
    const issues: ProfileIssue[] = [];
    expect(readSeparation({ mode: 'icc' }, issues)).toBeNull();
    expect(issues[0]?.code).toBe('separation.mode_unsupported');
    expect(issues[0]?.details).toEqual({ value: 'icc' });
  });
});
