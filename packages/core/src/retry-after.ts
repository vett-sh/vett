const MAX_RETRY_AFTER_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Parses an HTTP `Retry-After` header into a bounded delay in milliseconds.
 *
 * Supports:
 * - delta-seconds: `120`
 * - HTTP-date: `Wed, 21 Oct 2015 07:28:00 GMT`
 *
 * Returns `undefined` if the header is missing/invalid or indicates a time in the past.
 */
export function parseRetryAfterMs(
  raw: string | null,
  nowMs: number = Date.now()
): number | undefined {
  if (!raw) return undefined;

  const asSeconds = Number(raw);
  if (Number.isFinite(asSeconds) && asSeconds > 0) {
    return Math.min(asSeconds * 1000, MAX_RETRY_AFTER_MS);
  }

  const asDateMs = Date.parse(raw);
  if (Number.isFinite(asDateMs)) {
    const delta = asDateMs - nowMs;
    if (delta > 0) return Math.min(delta, MAX_RETRY_AFTER_MS);
  }

  return undefined;
}
