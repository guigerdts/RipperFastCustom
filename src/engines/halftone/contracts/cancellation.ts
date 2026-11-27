/**
 * Cooperative cancellation token for the halftone engine.
 *
 * The token is a caller-supplied predicate, never owned by the engine. The
 * engine consults it at bounded checkpoints — exactly one per output row per
 * channel — and never stores it or any derived state globally. A `true` result
 * stops the run and yields a `cancelled` envelope with no rasters and no
 * snapshot; a partially filled raster is local and is discarded.
 *
 * From the engine's side the token is pure: the engine only calls it. A token
 * that returns `true` after a fixed number of calls therefore makes the
 * cancellation point deterministic across identical runs. Cancellation is
 * synchronous and cooperative; the engine does not spawn work that could keep
 * running after it returns.
 */
export type CancellationToken = () => boolean;
