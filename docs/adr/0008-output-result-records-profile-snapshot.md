# Output results record an immutable profile snapshot

A screening result stores the effective parameters it used — profile identity and snapshot, TRC,
limits, method, output resolution and engine version — instead of a reference to the editable
profile. Editing a profile later must not change how an earlier result is interpreted.

**Considered options**: storing a profile reference (rejected — historical interpretation would
drift silently).
