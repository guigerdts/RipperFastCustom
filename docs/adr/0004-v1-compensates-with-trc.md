# v1 compensates dot gain with TRC curves, it does not model it

The first version applies per-channel tone reproduction curves supplied from real calibration,
preserves the original curve and records which one was used; it does not predict mechanical gain
or Yule–Nielsen optical gain.

**Considered options**: an analytical gain model (rejected for v1 — its parameters cannot be
derived from first principles, and committing to one would freeze the contracts before the
process data exists). The architecture leaves room to add models later without changing domain
contracts.
