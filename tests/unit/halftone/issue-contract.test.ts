import { describe, expect, it } from 'vitest';
import {
  ISSUE_REGISTRY,
  createIssue,
  isRegisteredIssueCode,
  resolveOutcomeStatus,
  type IssueCode,
  type IssueScope,
  type IssueSeverity,
} from '../../../src/engines/halftone/contracts';

describe('issue contract', () => {
  it('derives severity and scope from the central registry', () => {
    const issue = createIssue('channel.trc_ambiguous', 'duplicate control point');
    expect(issue.severity).toBe(ISSUE_REGISTRY['channel.trc_ambiguous'].severity);
    expect(issue.scope).toBe(ISSUE_REGISTRY['channel.trc_ambiguous'].scope);
  });

  it('represents every severity through a registered code', () => {
    const severities: readonly IssueSeverity[] = [
      createIssue('channel.trc_ambiguous', 'x').severity,
      createIssue('channel.limits_identity', 'x').severity,
      createIssue('channel.trc_non_monotonic', 'x').severity,
    ];
    expect(new Set(severities)).toEqual(new Set(['error', 'warning', 'info']));
  });

  it('represents every scope value', () => {
    const scopes: readonly IssueScope[] = [
      'input',
      'profile',
      'channel',
      'geometry',
      'separation',
      'output',
      'preview',
    ];
    expect(new Set(scopes).size).toBe(7);
  });

  it('rejects an unregistered code', () => {
    expect(isRegisteredIssueCode('made.up.code')).toBe(false);
    expect(() => createIssue('made.up.code' as IssueCode, 'x')).toThrow();
  });

  it('accepts a registered code through the guard', () => {
    expect(isRegisteredIssueCode('channel.trc_ambiguous')).toBe(true);
  });

  it('carries structured context, not just a message', () => {
    const issue = createIssue('profile.missing_am_parameter', 'missing frequency', {
      offendingValue: undefined,
      expected: 'positive LPI',
      parameter: 'frequency',
      channel: 'cyan',
      profileField: 'channels[0].screening',
    });
    expect(issue.context.expected).toBe('positive LPI');
    expect(issue.context.parameter).toBe('frequency');
    expect(issue.context.channel).toBe('cyan');
    expect(issue.context.profileField).toBe('channels[0].screening');
  });

  it('normalises non-finite numbers so the issue survives JSON round-trip', () => {
    const issue = createIssue('channel.trc_out_of_range', 'x', {
      offendingValue: { input: Number.NaN, output: Number.POSITIVE_INFINITY },
      details: { low: Number.NEGATIVE_INFINITY, finite: 0.25 },
    });
    const roundTrip = JSON.parse(JSON.stringify(issue)) as typeof issue;
    expect(roundTrip.context.offendingValue).toEqual({ input: 'NaN', output: 'Infinity' });
    expect(roundTrip.context.details).toEqual({ low: '-Infinity', finite: 0.25 });
  });

  it('round-trips a finite structured context unchanged', () => {
    const issue = createIssue('channel.limits_invalid', 'x', {
      offendingValue: { a_wf: 0.9, a_vf: 0.1 },
      expected: 'a_wf < a_vf',
    });
    const roundTrip = JSON.parse(JSON.stringify(issue)) as typeof issue;
    expect(roundTrip.context).toEqual(issue.context);
  });

  it('treats an error as rejected, a warning as completed and info as diagnostic', () => {
    expect(resolveOutcomeStatus([{ severity: 'error' }])).toBe('rejected');
    expect(resolveOutcomeStatus([{ severity: 'warning' }])).toBe('completed');
    expect(resolveOutcomeStatus([{ severity: 'info' }])).toBe('completed');
    expect(resolveOutcomeStatus([])).toBe('completed');
  });

  it('rejects the outcome when any issue is an error, regardless of order', () => {
    expect(resolveOutcomeStatus([{ severity: 'warning' }, { severity: 'error' }])).toBe('rejected');
  });
});
